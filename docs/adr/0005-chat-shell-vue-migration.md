---
title: Migrate the chat shell (header + tab strip + content host) then the transcript rendering to Vue 3 + Pinia islands over the untouched engine
date: 2026-07-12
status: accepted
scope: src/features/chat/SpecoratorView.ts, src/features/chat/ui/vue, src/features/chat/ui/vue/transcript, src/features/chat/tabs, src/features/chat/controllers, src/features/chat/state
supersedes: none
relates-to: docs/superpowers/specs/2026-07-11-chat-shell-vue-migration-design.md, docs/superpowers/plans/2026-07-11-chat-shell-vue-migration.md, docs/adr/0004-agent-board-vue-migration.md, docs/adr/0003-retire-legacy-library-views.md, docs/superpowers/specs/2026-07-03-vue-style-baseline-design.md
method: accrete-then-swap (unwired Vue behind characterization/parity tests, one live cutover), engine seam held green throughout, post-cutover manual QA in Obsidian
---

# ADR 0005 — Chat shell Vue 3 + Pinia migration

## Status

**Accepted and implemented.** Sub-project 1 (chat shell) landed 2026-07-11
across commits `2f98016`..`b506de1` plus the Task 7 sweep. Sub-project 2
(transcript rendering) landed 2026-07-12 — see "Sub-project 2 — Transcript
rendering" below.

## Context

`features/chat` is Specorator's largest remaining imperative surface (~25k
LOC): the daily-driver sidebar chat. It splits cleanly into a **view layer**
(rendering, tabs, chrome, composer) and an **engine layer** (`TabManager`
runtime/warmup coordination, controllers, `ChatState`, stream-consumption
state machines). `SpecoratorView` used to hand-build the outer frame —
`specorator-header` (title row + bound-agent/actions meta row), the
`TabBar`-rendered tab-badge strip, and the `specorator-tab-content-container`
— imperatively in `onOpen`, re-invoking `updateTabBar()` from eight different
`TabManager` callbacks.

ADR 0004 (Agent Board) had already proven the "reactive island over an
untouched engine" seam for a second, independent surface, and the Library
migration before it. The chat shell was the natural next surface: high-churn,
daily-driver UI where an imperative patch-in-place frame was the most
change-prone part of the file, but the actual chat *engine* (streaming,
runtime lifecycle, tab switching) is stable and must not be touched.

## Decision

1. **View → Vue; engine untouched.** The chat shell *frame* — header, tab
   strip, and the tab-content host — becomes a Vue 3 + Pinia island
   (`ui/vue/ChatShellRoot.vue`, mounted by `SpecoratorView.mountChatShell()`).
   The engine — `TabManager`, every controller, `ChatState`, and each tab's
   persistent imperative DOM subtree — is not touched and keeps running
   exactly as before. `TabBar.ts` and the imperative `buildHeader` /
   `buildNavRowContent` / `updateTabBar` methods are deleted.
2. **Four-sub-project decomposition; this is sub-project 1.** The full
   `features/chat` view migration is too large for one PR, so it is split into
   four independently shippable sub-projects, each its own spec → plan → PR:
   (1) chat shell — header + tab strip + content host (**this ADR**), (2)
   transcript rendering pipeline (`MessageRenderer` + block renderers), (3)
   composer + input toolbar, (4) side panels (status panel, conversation
   history, navigation sidebar, file/image context). This ADR covers
   sub-project 1 only; it establishes the chat Vue island seam and the
   content-hosting contract the later sub-projects build on.
3. **No feature flag — direct cutover.** Mirroring ADR 0004: the shell swapped
   in one commit (`c0c2a65`) with no `useVue*` flag, gated on characterization
   tests locking `TabBar`'s exact DOM/a11y/keyboard behavior *before* deletion,
   Vue `TabStrip`/`TabBadge` parity tests reproducing every assertion, plus a
   manual vault smoke checklist (chat is the daily driver: open/switch/close
   tabs, streaming/attention badges, work-order tab visibility, history
   dropdown, bound-agent chip, empty state).
4. **The reactive seam.** `ui/vue/stores/chatShellStore.ts`
   (`useChatShellStore`) is a projection over `TabManager`: `tabs:
   TabBarItem[]` for the strip, `header` chrome (title, boundAgent,
   activeProviderId, tabBarPosition, visibility flags), and `activeTabId`.
   Setters replace whole values/arrays (`shallowRef`), the same
   churn-minimizing contract as `useAgentBoardStore`. `TabManager`
   remains the source of truth; the store never owns I/O.
5. **Event routing reuses existing callbacks — no new events.**
   `ui/vue/useChatShellEventRouting.ts` subscribes on mount to a
   `ChatShellSubscribe` seam the view exposes (`ui/vue/chatShellCallbacks.ts`)
   and pushes a fully-projected `ChatShellSnapshot` (`tabs`, `header`,
   `activeTabId`) into the store's setters on unmount-safe teardown.
   `SpecoratorView` still owns the real `TabManager` callbacks
   (`onTabCreated` / `onTabSwitched` / `onTabClosed` /
   `onTabStreamingChanged` / `onTabTitleChanged` / `onTabAttentionChanged` /
   `onTabConversationChanged` / `onTabProviderChanged`) and re-projects on
   each via `emitChatShellChange()` — mirroring `useBoardEventRouting`.
6. **Vue → engine goes through one callbacks contract.**
   `ChatShellCallbacks` (provided via `CALLBACKS_KEY`) is the only path from
   Vue back into the engine — thin delegators (`onTabClick`, `onTabClose`,
   `onNewTab`, `onNewConversation`, `onOpenHistory`, `onOpenWorkOrders`,
   `onQuickActions`, `onRename`, `onOpenSettings`, `mountHistoryHost`,
   `mountWorkOrderHost`, `mountGitActionHost`, `resolveNavRowEl`,
   `renderProviderLogo`) to existing `SpecoratorView` / `TabManager` methods.
   Vue never imports or reaches into the engine directly.
7. **The content-hosting seam (the novel part).** `TabContentHost.vue` renders
   the `specorator-tab-content-container` element exactly once and hands it to
   the engine via `CONTENT_HOST_KEY`, captured synchronously during
   `app.mount()` — before `initTabContentEngine()` needs it. Vue owns the
   element but treats its children as **opaque**: no `v-for`, never
   re-rendered, so the imperative `tabFactory` keeps `createDiv`-ing each
   tab's `specorator-tab-content` subtree into it and toggling
   `specorator-hidden` on switch, unchanged. All N tabs' subtrees — including
   live streaming DOM and scroll position — persist across shell re-renders.
   Same "leave-me-alone host" contract as the Library's `MarkdownHost` and the
   Agent Board's lane-editor mount. The dedicated seam test
   (`tests/vue/chat/tabContentHost.test.ts`) mounts the host, imperatively
   appends a child + listener, forces a shell re-render, and asserts the
   child and its listener survive.
8. **Dual-mode header + nav-row Teleport.** `store.header.tabBarPosition`
   (`'header'` | `'input'`, projected from `plugin.settings.tabBarPosition`)
   drives `ChatHeader.vue`'s layout. In `'header'` mode the tab strip and
   header actions render in place in the header chrome. In `'input'` mode
   they `<Teleport>` into the active tab's `navRowEl` (resolved via
   `cb.resolveNavRowEl(activeTabId)`), re-targeting reactively when the
   active tab changes; a null target (no active tab yet) disables the
   Teleport and falls back to in-place rendering rather than erroring on a
   missing target — mirroring the old `updateNavRowLocation`'s input-mode
   branch, now declarative.

## Consequences / accepted trade-offs

- **What stays imperative.** The conversation-history and
  work-order-activity dropdowns (`ConversationHistoryView`, the work-order
  dropdown) and the `GitActionButton` are unchanged imperative widgets;
  `HeaderActions.vue` exposes container refs and the callbacks
  (`mountHistoryHost` / `mountWorkOrderHost` / `mountGitActionHost`) host
  them into the Vue tree ("island hosts imperative widget"). Transcript
  rendering, the composer + input toolbar, and the remaining side panels
  (status panel, navigation sidebar, file/image context) are entirely out of
  scope — each is a future sub-project of the larger `features/chat`
  migration. `InlineAskUserQuestion.renderTabBar` (a mini tab-bar inside the
  ask-user card) is a separate, independent rendering path left imperative
  here; auditing it for projection consistency with the Vue strip is
  deferred to the side-panels/transcript sub-projects.
- **No-flag cutover was QA'd post-swap**, same trade-off ADR 0004 accepted:
  the risk of a direct replacement was bounded by characterization/parity
  tests written against exact DOM/a11y/keyboard parity before the swap, the
  untouched engine plus its green Jest specs, and a manual vault smoke
  checklist as the merge gate for this daily-driver surface. A regression
  could only reach a user after the swap, not behind a flag.
- **Coverage lane accounting.** The deleted imperative frame code
  (`TabBar.ts`, `buildHeader`, `buildNavRowContent`, `updateTabBar`) was
  heavily Jest-covered; its Vue replacement lives in the Vitest lane.
  `src/features/chat/ui/vue/**` is excluded from Jest `collectCoverageFrom`
  and added to Vitest `coverage.include`, mirroring the
  `src/features/tasks/ui/vue/**` exception, so neither lane's global floor is
  distorted by code the other lane tests.
- **`SpecoratorView.ts` shrank, but stays grandfathered.** The cutover deleted
  the imperative frame-build methods, dropping the file from 1112 to 957
  nonblank LOC (still above the 500-LOC cap, so it keeps a `loc-baseline.json`
  entry — re-locked down from 1112 in this Task 7 sweep, since the LOC guard
  is shrink-only and does not auto-tighten a grandfathered ceiling).

## Sub-project 2 — Transcript rendering (2026-07-12)

The ADR 0004/0005 island seam pushed one level deeper, into the per-tab
`messagesEl`. The imperative `MessageRenderer`, top-level/stored block
renderers, and the DOM-patching streaming write-side were deleted and replaced
by a single Vue 3 + Pinia island (`ui/vue/transcript/`) that renders both stored
and live turns through one reactive path. `TabManager`, tab lifecycle, provider
runtimes, and `StreamController`'s chunk-routing + block-transition projection
logic stay intact — only the stream **output** changed from raw DOM mutation to
reactive-data mutation.

1. **Streaming becomes data, not DOM.** The in-flight assistant turn is an
   ordinary `ChatMessage` whose `contentBlocks`/`toolCalls` are appended/updated
   as data during the turn; Vue renders it through the same components as any
   stored message — there is NO separate live path and NO feature flag. The
   coordinators (`TextRenderCoordinator`/`ThinkingRenderCoordinator`/
   `toolCallAppend`) grow the message data; `ChatState` exposes
   `activeMessageId`/`activeBlockIndex` + `getActiveStreamSnapshot()`. The cut
   removed `ChatState`'s DOM-pointer fields (`currentContentEl`, `currentTextEl`,
   `toolCallElements`, `writeEditStates`, …) and `StreamController` shrank
   774→617 LOC.
2. **Accrete-then-swap, one cutover.** Same discipline as sub-project 1: Tasks
   1–17 were additive and unwired (new `ui/vue/transcript/` files, green
   characterization/parity tests, imperative transcript still live); the hard
   cut (Task 18) deleted the renderers, flipped the mount to `mountTranscript`,
   and removed the DOM-pointer fields in one commit.
3. **The message-identity-refresh reactivity contract (the C1/C2 fix).** The
   engine mutates the SAME `ChatMessage` object IN PLACE
   (`msg.content += chunk`, `contentBlocks.push`, `toolCall.result = …`), so the
   object identity never changes — but `MessageBubble` is a keyed `v-for` child,
   so an unchanged identity makes Vue skip the patch and the live turn renders
   blank (C1). Symmetrically, an async/background subagent completing AFTER the
   turn ends mutates a non-active message that the active-message refresh won't
   catch (C2). `tabs/tabTranscript.ts`'s `TabTranscriptProjection` therefore
   gives, on each snapshot, a **fresh identity** to the actively-streaming
   message (`activeMessageId`) AND any off-stream-dirtied message
   (`refreshMessage(id)`) — including fresh tool-call and nested `subagent`
   references, since those reach `ToolCall`/`SubagentBlock` by object reference.
   The clone is snapshot-only: it never touches `ChatState.messages`, so the
   engine's live `msg` keeps growing the original object.
   `tests/vue/chat/transcript/liveMutation.regression.test.ts` locks both C1
   and C2 against the real `mountTranscript` path.
4. **The `.specorator-*` DOM contract (what the remaining sub-projects depend
   on).** Vue took over the transcript DOM, but four still-imperative consumers
   read it by class/attribute and are OUT of scope here:
   `NavigationController`/`NavigationSidebar` (scan `.specorator-message-user` +
   `offsetTop`), the three selection controllers, `ChatDropController` (overlay),
   and `StreamController` auto-scroll (`.specorator-messages` scroll container).
   The Vue components therefore emit the exact legacy `.specorator-*`
   classes/attributes alongside the `.specorator-vue` baseline.
   `tests/vue/chat/transcript/domContract.test.ts` mounts the real
   `TranscriptRoot` over a fixture exercising every block type + user/assistant +
   streaming + chrome and asserts every consumer-queried class/attribute — the
   regression backstop that keeps the composer + side-panel sub-projects
   unblocked while those consumers stay imperative.
5. **Novel seams.** `MarkdownHost.vue` quarantines the one Vue-hostile surface
   (async Obsidian markdown): it owns one element, treats children as opaque,
   re-renders on text change, and drops stale renders with a monotonic
   generation token (render into a detached element, swap only after the token
   check). Inline blocking cards (`inline/`) are mounted via the
   `mountInlineCard` seam while `InlinePromptController` keeps owning the promise
   the runtime awaits + the ref-counted composer-hide + `needsAttention` badge;
   abort/dismiss resolves the promise with `null` (never rejects). `TranscriptRoot`
   hands its `.specorator-messages` scroll element up through `SCROLL_HOST_KEY`
   (mirror of the shell's `CONTENT_HOST_KEY`).
6. **Guardrail accounting.** `messageRenderer.perf` moved to the Vue lane as
   `tests/vue/chat/transcript/transcriptScaling.test.ts` (the Jest perf lane
   stubs `.vue`/`mountTranscript`); `navigationSidebar.perf` +
   `multiTabStreaming.perf` stay in the Jest perf lane. `InputController` was
   re-locked 1199→1194: the cutover moved assistant-message activation/discard
   bookkeeping into it, then extracted it back out to
   `controllers/streamingMessageLifecycle.ts` to keep the LOC ceiling shrinking
   rather than grow. `scripts/quality-baseline.json`'s duplication counters rose
   deliberately (cloneGroups 32→36, duplicatedLines 787→1048) during cutover.
   The 2026-07-14 debt sweep moved web-search/tool-header logic into shared
   DOM-free viewmodels, shared both plan cards' lifecycle, removed stored shadow
   renderers, and deleted the obsolete `toolCallElements` DOM map. Detached
   subagent lifecycle adapters remain until their stream coordinators become
   data-only.

### Deferred follow-ups (sub-project 2)

- Auto-turn retry-suppression consistency and a custom streaming-indicator text
  hook were tracked parity gaps; the indicator text hook now projects through
  `ActiveStreamState.label`, while retry-suppression consistency remains.
- Provider-lifecycle spawn tools render as a plain `ToolCall`; the consolidated
  spawn+wait+close card is unbuilt.

## Deferred / known items

- Sub-projects 3–4 (composer/input toolbar, side panels) are unscheduled
  follow-ups; each gets its own spec/plan/PR under the same
  island-over-untouched-engine pattern.
- `InlineAskUserQuestion.renderTabBar`'s consistency with the Vue `TabStrip`
  projection is unaudited (see above); tracked for a later sub-project rather
  than blocking this one.
- Cursor/Opencode/Codex chat surfaces reuse the same `SpecoratorView` /
  `TabManager` engine and therefore inherit this shell island automatically;
  no provider-specific follow-up is required.

## References

- Spec (sub-project 1): `docs/superpowers/specs/2026-07-11-chat-shell-vue-migration-design.md`
- Plan (sub-project 1): `docs/superpowers/plans/2026-07-11-chat-shell-vue-migration.md`
- Spec (sub-project 2): `docs/superpowers/specs/2026-07-12-transcript-rendering-vue-migration-design.md`
- Plan (sub-project 2): `docs/superpowers/plans/2026-07-12-transcript-rendering-vue-migration.md`
- Prior reactive-cutover precedent: `docs/adr/0004-agent-board-vue-migration.md`,
  `docs/adr/0003-retire-legacy-library-views.md`
- Style baseline: `docs/superpowers/specs/2026-07-03-vue-style-baseline-design.md`
