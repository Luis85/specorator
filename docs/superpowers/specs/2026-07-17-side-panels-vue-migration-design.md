---
title: Chat side panels + header remnants — Vue 3 + Pinia migration (sub-project 4)
date: 2026-07-17
status: draft
scope: features/chat — StatusPanel, NavigationSidebar, ConversationHistoryView, WorkOrderActivityDropdown, GitActionButton
---

# Chat side panels + header remnants — Vue 3 migration (sub-project 4)

## Overview

The fourth and final sub-project of the chat Vue 3 + Pinia migration, following the
shell (#484), transcript (#486), and composer (#489) islands. It migrates every
remaining imperative chat rendering surface, so that afterward the only imperative
chat UI is the intentionally-retained engine widgets (inline-edit's shared
`SlashCommandDropdown`; the context/mode managers that own truth, not rendering).

The migration reuses the established island harness — per-leaf `createApp` + fresh
Pinia, a projection seam feeding a `shallowRef` read-model store, a thin
`*Callbacks` Vue→engine delegator seam, element-handle keys for engine-driven host
nodes, the `.specorator-vue` style baseline (`--sp-*` tokens), and a DOM-contract
test as the regression backstop. The imperative engine — `ChatState`, controllers,
`StreamController`, the `workOrderActivity` / `gitStatusWatcher` providers, and the
`ConversationStore` — stays untouched behind the projection seam. `NavigationController`
(keyboard/vim) is a pure controller and is out of scope.

## Scope

**In (five surfaces):**

1. **StatusPanel** (`ui/StatusPanel.ts`, ~470 LOC, per-tab) — todos + bang-bash output list.
2. **NavigationSidebar** (`ui/NavigationSidebar.ts`, ~110 LOC, per-tab) — the 4-button scroll navigator.
3. **ConversationHistoryView** (`ui/ConversationHistoryView.ts`, 413 LOC, per-tab, owned by `ConversationController`) — the header conversation-history dropdown.
4. **WorkOrderActivityDropdown** (`ui/WorkOrderActivityDropdown.ts`, 123 LOC, per-view) — the header work-order activity dropdown.
5. **GitActionButton** (`ui/GitActionButton.ts`, 60 LOC, per-view) — the header commit-&-push button.

**Out:**

- `NavigationController` (keyboard/vim scroll + focus) — pure controller, no render surface; keeps its post-mount `rebindMessagesEl` seam.
- Inline-edit's shared `SlashCommandDropdown` (retained by design, per the composer sub-project).
- Context/mode managers (`FileContextManager`, `ImageContextManager`, `InstructionModeManager`, `BangBashModeManager`) — own truth/IO; their rendering is already Vue.
- The transcript and composer islands — untouched (NavOverlay only *reads* the transcript's contract-locked scroll host + `.specorator-message-user`).

## Architecture — two homes

The five surfaces fall into two homes, each reusing an established seam.

### Home 1 — Shell island extension (per-view)

The three header widgets are already hosted *inside* the shipped shell island via
`mount*Host` callbacks. They become **native Vue components** rendered directly in
`ChatHeader.vue` / `HeaderActions.vue`, reading three new projected `chatShellStore`
slices and firing new `ChatShellCallbacks`. The imperative widgets + their
`mountHistoryHost` / `mountWorkOrderHost` / `mountGitActionHost` callbacks + host
container refs are deleted.

New `chatShellStore` slices (projected by `SpecoratorView.projectChatShellHeader()`,
fanned through the existing `emitChatShellChange` → `ChatShellSubscribe` seam;
`shallowRef` whole-value replacement):

- **`conversations`** — `{ items: ConversationMeta[] (sorted lastResponseAt??createdAt desc), currentConversationId, perItem: { openState, titleGenerationStatus } }`. Note the list is global (`ConversationStore`) but `currentConversationId` is the **active tab's** — consistent with the shell store already projecting active-tab-derived header state, so history highlighting follows the active tab on switch (a `activeTabId` change re-projects, matching today's per-tab re-render).
- **`workOrder`** — the `WorkOrderActivitySummary` (already a plain serializable value: `items`, `closableTabs`, `runningCount`, `attentionCount`).
- **`git`** — `{ isRepo, dirtyCount, visible }` (from `gitStatusWatcher`; `visible` = `shouldShowGitButton`).

New `ChatShellCallbacks` delegators (thin Vue→engine): conversation `onSwitch` /
`onOpenInNewTab` / `onRename` / `onDelete` / `onRegenerateTitle` / `onContextMenu`;
work-order `onOpenWorkOrderItem` / `onCloseWorkOrderTab`; `onGitCommit`.
`ConversationController` sheds its list-*presentation* role (it keeps session
switch/reload/save/rewind; the list projection replaces `renderHistoryDropdown`).

### Home 2 — New per-tab "tab-chrome" island

Mirrors `mountTranscript` / `mountTabComposer`: `mountTabChrome(tab, plugin, component)`
→ `createApp(TabChromeRoot)` + a **fresh** `createTabChromePinia()` per leaf, rooted at
the existing `statusPanelContainerEl` host, mounted per-tab between tab creation and
controller init (like the composer). It renders two independent components:

- **`StatusPanel.vue`** in place, over a new `TabChromeProjection` (`{ todos, bashOutputs }`)
  + `useTabChromeStore`.
- **`NavOverlay.vue`** `<Teleport>`ed to its floating host over the transcript
  (Teleport is already used by the shell for the tab strip). Its scroll geometry
  stays imperative in a `useTabNavigation` composable driven by the transcript
  scroll-host handle (received via a handle key — the same "Vue renders, engine
  drives behavior" contract as the composer's engine-driven hosts).

## Per-widget designs

### StatusPanel.vue (todos + bash)

- **Todos**: reuse the existing `transcript/blocks/TodoListView.vue` (emits the exact
  `.specorator-todo-*` classes, shares `getTodoStatusIcon`/`getTodoDisplayText`),
  fed from a projected `todos` slice off `ChatState.currentTodos`.
- **Bash outputs (the one relocation)**: today they live in a *panel-local* LRU-50 `Map`,
  written by the bang-bash `onSubmit` start/finish in `tabUi.ts`. Lift that map to the
  **engine side** — a small owner (a `BashOutputStore` field on the tab, still LRU-50)
  that the bang-bash callbacks write to; `TabChromeProjection` projects a bounded
  `bashOutputs` slice. Vue renders the reactive list; **collapse/per-entry-expand are
  view-only local `ref` state** (no engine coupling); copy (clipboard) and clear are
  callbacks. Truth stays in the engine.
- Emits the legacy `.specorator-status-panel-*` classes and reuses the generic
  `.specorator-tool-*` classes for bash entries — for CSS parity only (no external
  DOM reader).

### NavOverlay.vue + useTabNavigation

- Vue renders `.specorator-nav-sidebar` (toggled `.visible`) with the four
  `.specorator-nav-btn--{top,prev,next,bottom}` buttons, `<Teleport>`ed to a
  floating host. The teleport target is a dedicated `.specorator-nav-sidebar-host`
  element positioned over the transcript — added to `buildTabDOM` (a sibling of
  the messages wrapper inside `contentEl`, where `NavigationSidebar` currently
  `createDiv`s its own container) and handed to the island; a null target falls
  back to in-place render (as the shell's nav-row teleport does).
- `useTabNavigation` keeps the imperative behavior bound to the transcript scroll
  host (received via a handle key, `nodeType===1`-guarded, popout-safe): rAF-debounced
  overflow → `.visible`; top/bottom smooth `scrollTo`; prev/next `offsetTop` scan of
  `.specorator-message-user`; re-bind on the transcript's post-mount scroll-host swap.
  `.visible` is a reactive value the composable computes.

### Shell header components

- **GitActionButton.vue** — reads `store.git`; `shouldShowGitButton` → computed;
  emits `.specorator-git-action*`; click → `onGitCommit`. Self-hides when not visible.
- **WorkOrderActivityDropdown.vue** — reads `store.workOrder`; a self-contained toggle
  button + `role=menu` popover; item click → `onOpenWorkOrderItem` (then close);
  finished-tab close-x → `onCloseWorkOrderTab` (menu stays open for batch dismissal);
  self-hides when empty; emits `.specorator-work-order-activity*`.
- **ConversationHistoryDropdown.vue** — reads `store.conversations`. **Preserves the
  perf-locked windowing**: a reactive `visibleCount` (chunk 50) + a "Show more" reveal
  + the active-conversation pin when it sorts past the window; a naive full `v-for`
  would fail `conversationHistory.perf`. Rows emit the legacy `.specorator-history-*`
  classes. Actions → callbacks (switch / open-in-new-tab on modifier/middle click /
  rename / delete (streaming-gated) / regenerate-title with pending/failed status).
  Two Obsidian idioms stay imperative-but-invoked-from-Vue: (a) the right-click
  **`Menu`** context menu — built in an `onContextMenu` callback; (b) the inline
  **rename `<input>`** — a local edit-mode `ref` + a plain `<input>` with Enter/Escape/
  blur + `isComposing` IME guard.

## Data flow

```
engine truth (ChatState.currentTodos / BashOutputStore / ConversationStore /
              workOrderActivity / gitStatusWatcher)
  -> projection (TabChromeProjection.emit / SpecoratorView.projectChatShellHeader)
  -> store setters (shallowRef whole-value replace)
  -> Vue components render
  -> user action -> *Callbacks delegator -> existing engine method
```

Emit points: `TabChromeProjection.emit()` on todo change (`onTodosChanged`), bash
start/finish, and conversation switch (remount parity); shell header re-projects on
the existing `projectChatShellHeader` triggers plus new subscriptions to
`workOrderActivity.subscribe` and `gitStatusWatcher.subscribe` and the
conversation-list change signal.

## DOM contract

Thinner than prior sub-projects. **No** side-panel or header widget emits a class
that another module queries (verified: `specorator-status-panel-*`,
`specorator-nav-*`, `specorator-history-*`, `specorator-work-order-activity-*`,
`specorator-git-action-*` appear only in their own files, CSS, and tests). The only
cross-surface read is **NavOverlay → the transcript's `.specorator-message-user` +
scroll host**, both already locked by the transcript's DOM-contract test.

A new `sidePanelsDomContract.test.ts` therefore locks: (a) each surface emits its
legacy classes for CSS parity, given a rich projection; (b) NavOverlay reads the
transcript's `.specorator-message-user` via the scroll host and drives prev/next; (c)
the element-handle registrations (scroll-host handle to `useTabNavigation`).

## Testing

- Per-component Vitest specs, characterization-first (mirror the composer/transcript
  component tests): StatusPanel (todos render, bash add/update/collapse/copy/clear),
  NavOverlay (visibility overflow, prev/next scan, teleport), Git/WorkOrder/History.
- **`conversationHistory.perf` preserved**: the 50-row chunk window + "Show more"
  progressive reveal + active-conversation pin must stay locked. If the widget moves
  fully to Vue, the DOM-growth assertion moves to the Vitest lane (as the transcript
  and agent-board perf guards did when those surfaces became islands); it must keep
  asserting `rows === min(n, 50)` and next-chunk reveal.
- Full Jest + Vitest suites; `sidePanelsDomContract.test.ts` as the cross-surface lock.

## Ratchets

Reuse `check:loc`, `check:quality` (net shrink expected: StatusPanel 470 + history
413 + others deleted, minus the new SFCs), `check:css` (reuse existing stylesheets +
`.specorator-vue` baseline; no new `!important`), `typecheck:vue`, coverage. Re-lock
all ratchets down in the final phase (the same procedure the composer sub-project
used). `check:quality` reads Istanbul coverage if a `coverage/` dir is present, which
inflates `criticalComplexity` far above baseline — always run it with no `coverage/`
dir (CI runs it clean).

## Phasing (subagent-driven; each commit shippable)

1. **Shell store slices + projection prep** — add `conversations` / `workOrder` /
   `git` slices to `chatShellStore` + their projection in `projectChatShellHeader` +
   the new `ChatShellCallbacks` delegators; subscribe to `workOrderActivity` /
   `gitStatusWatcher`. Unwired (imperative widgets still render).
2. **Native header components + cutover** — `GitActionButton.vue`,
   `WorkOrderActivityDropdown.vue`, `ConversationHistoryDropdown.vue` (with windowing);
   render them in `ChatHeader`/`HeaderActions`; delete the three imperative widgets +
   their `mount*Host` callbacks/host refs; `ConversationController` sheds list
   presentation. Perf guard preserved.
3. **Tab-chrome island scaffold + StatusPanel** — `mountTabChrome` + `createTabChromePinia`
   + `TabChromeProjection` + `useTabChromeStore` + `StatusPanel.vue`; lift the
   bash-output map to the engine; wire into tab lifecycle; delete `StatusPanel.ts`.
4. **NavOverlay + useTabNavigation** — the teleported button island + imperative
   scroll composable driven by the scroll-host handle; delete `NavigationSidebar.ts`.
5. **DOM-contract test + docs + re-lock** — `sidePanelsDomContract.test.ts`; update
   `src/features/chat/CLAUDE.md` (empty the "Still-imperative" line to nothing but the
   retained engine widgets) + ADR 0005 (sub-project 4 note); re-lock ratchets.

## Parity, error handling, risks

- **Strict behavior parity.** Async paths keep their existing engine methods: title
  regeneration (pending/failed icons), conversation load/delete (streaming-gated
  delete), git commit prompt, work-order open/close. No provider/runtime change.
- **Risks / watch-items**: (a) the history windowing perf guard — the highest-risk
  item; the Vue port must reproduce the chunk-50 + Show-more + active-pin exactly. (b)
  Bash-output state relocation — must remain LRU-50 and survive conversation switch
  (the `remount()` parity). (c) NavOverlay's cross-window scroll-host binding — reuse
  the `nodeType===1` popout-safe guard and the transcript's post-mount rebind seam. (d)
  Obsidian `Menu` context menu + inline rename `<input>` remain imperative idioms
  invoked from Vue, not reactive templates. (e) Teleport target availability — fall
  back to in-place render if the floating host is absent (as the shell's nav-row
  teleport does).

## Out-of-scope confirmation (end state)

After this sub-project the chat feature has no imperative *rendering* surface left:
shell, transcript, composer, side panels, and header widgets are all Vue islands. The
only imperative code is the retained engine widgets (inline-edit's `SlashCommandDropdown`)
and the truth-owning managers/controllers/providers behind the projection seams.
