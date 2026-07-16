---
title: Migrate the chat composer + input toolbar to a Vue 3 + Pinia island
date: 2026-07-16
status: draft
scope: src/features/chat (InputController, tabInputWiring, tabUi/tabFactory composer DOM, ui/toolbar/*, InputToolbar, FileContext/ImageContext view layers, EditedFilesView), src/features/chat/ui/vue/composer (new)
---

# Composer + Input Toolbar Vue Migration — Design

## Context

`features/chat` is migrating to Vue 3 + Pinia one coherent surface at a time,
each surface a per-leaf island mounted over the **untouched** imperative engine
(`TabManager`, controllers, `ChatState`, stream state machines). Three islands
have shipped:

- **Sub-project 1 — Chat Shell** (ADR 0005, PR #484): header + tab-badge strip +
  tab-content host.
- **Sub-project 2 — Transcript** (ADR 0005, PR #486): the per-tab transcript
  rendering pipeline (`MessageRenderer` + every `rendering/*` block renderer).

The two remaining imperative chat surfaces are the **composer + input toolbar**
and the **side panels** (status panel, navigation sidebar, and the shell's
still-hosted history/work-order/git dropdowns). This spec covers the
**composer**, migrated in a single sub-project (sub-project 3).

The composer is the most interaction-dense, keyboard/IME-coupled surface in the
plugin. It owns the textarea, the nine input-toolbar widgets, file/image context
chips, the slash/mention/resume dropdowns, the `#` instruction and `!` bang-bash
input modes, and the send affordance — wired through `tabInputWiring.ts` and
`InputController` with a Mod+Enter dual-send safety net and deep provider gating.

### Established pattern (reused verbatim)

Every prior island uses the same seam, which this sub-project mirrors one level
deeper into the composer:

- A per-leaf `createApp(Root)` + a **fresh** per-leaf Pinia (never a shared
  singleton — each tab owns its own input state).
- A `shallowRef` **reactive read-model store** (whole-value replacement, no
  deep-proxy) that is a *projection* of engine state. Truth + I/O stay in the
  engine.
- A **projection source** (`Tab*Projection`) that fans a fully-projected
  snapshot to observers on engine change — the `subscribe` side of a callbacks
  seam. It never invents events; the engine still owns the real callbacks.
- A **callbacks seam** (`*Callbacks`, provided via an injection key): thin
  Vue→engine delegators. Vue never reaches into the engine directly.
- **Element-handle keys** for the "Vue owns the element, the engine drives it"
  contract (`CONTENT_HOST_KEY` in the shell, `SCROLL_HOST_KEY` in the
  transcript): Vue renders a DOM element and hands the raw node to the engine,
  which keeps mutating it directly.
- The `.specorator-vue` style baseline + `--sp-*` tokens for all island CSS
  (`docs/superpowers/specs/2026-07-03-vue-style-baseline-design.md`).
- A `*DomContract.test.ts` that mounts the real root and locks every class /
  element still read by out-of-scope imperative consumers.

## Goals

- Migrate the composer's rendering — textarea host, the nine toolbar widgets,
  file/image chips + selection indicators, edited-files bar, the
  slash/mention/resume dropdowns (send stays keyboard-only — no send button
  exists today) — to a Vue 3 + Pinia
  island under `ui/vue/composer/`.
- Preserve **strict behavior parity** with the imperative composer, including
  IME composition, Mod+Enter dual-send, caret-anchored dropdowns, provider
  gating, and every cross-surface DOM contract.
- Leave `InputController`, `tabInputWiring`, every controller, `ChatState`, and
  the provider/runtime boundary **untouched** except where a widget's imperative
  DOM write becomes a reactive-data mutation.
- Delete the replaced imperative widget code (`ui/toolbar/*`, `InputToolbar.ts`,
  the `FileContext`/`ImageContext` view layers, `EditedFilesView`, and the
  composer's imperative DOM assembly) so the LOC ratchet net-shrinks.

## Non-Goals

- **Side panels** (status panel, navigation sidebar) and the shell's still-hosted
  history/work-order/git dropdowns — a later sub-project.
- **`InlineEditModal`** and the shared `shared/components/SlashCommandDropdown.ts`
  it depends on — inline-edit is not a Vue island and stays out of scope. The
  shared imperative component is left in place for it (see Dropdowns).
- The inline blocking cards (`inline/*`) — already migrated in sub-project 2.
- Any change to input *behavior* — this is a rendering migration, not a UX
  redesign.
- Reworking the trigger-detection state machines (slash/mention/resume trigger
  detection, catalog queries, mention providers) — that logic stays in the
  engine; only rendering moves.

## Composer anatomy (current imperative structure)

Built imperatively in `tabFactory.ts` (elements) + `tabUi.ts` (widgets):

```
inputContainerEl (.specorator-input-container)      [InlinePromptController ref-counted hide; drop overlay host]
├── navRowEl        (.specorator-input-nav-row)      [SHELL teleports the tab strip here in 'input' tabBarPosition mode]
├── queueIndicatorEl (.specorator-input-queue-row)   [QueuedMessageController builds the queued-follow-up edit/discard/Steer-Now UI here]
└── inputWrapper    (.specorator-input-wrapper)      [ChatDropController queries this for the drop overlay]
    ├── contextRowEl (.specorator-context-row)       [file/image chips + selection/browser/canvas indicators]
    ├── inputEl      (<textarea class="specorator-input">)   [the composer textarea]
    └── inputToolbar (.specorator-input-toolbar)      [the nine widgets, created in tabUi.ts]
```

`queueIndicatorEl` is created under `inputContainerEl` in `tabFactory.ts` and
registered to **both** `tab.dom.queueIndicatorEl` and `state.queueIndicatorEl`.
`QueuedMessageController.updateQueueIndicator()` mutates that element directly to
render the queued-follow-up row (message text + edit / discard / Steer-Now
actions) during streaming sends, called from `InputController`, `StreamController`,
and `streamingIndicator`.

The nine toolbar widgets (`ui/toolbar/`): `ModelSelector`, `ModeSelector`,
`ThinkingBudgetSelector`, `ServiceTierToggle`, `PermissionToggle`,
`PlanModeToggle`, `McpServerSelector`, `ExternalContextSelector`,
`ContextUsageMeter`. Assembled by `InputToolbar.ts`'s `createInputToolbar`.
Context managers: `FileContextManager` (`ui/FileContext.ts` +
`ui/file-context/`), `ImageContextManager` (`ui/ImageContext.ts`),
`EditedFilesView`. Dropdowns: `shared/components/SlashCommandDropdown.ts`
(shared with inline-edit), the mention dropdown, and
`shared/components/ResumeSessionDropdown.ts` (chat-only).

## Architecture

### Island mount & seams

- **Mount**: `mountComposer(containerEl, plugin, component, callbacks)` per tab
  (mirror of `mountTranscript`) → `createApp(ComposerRoot)` + a fresh per-leaf
  `createComposerPinia()`. Provides `APP_KEY` / `COMPONENT_KEY` / `PLUGIN_KEY` /
  `CALLBACKS_KEY`.
- **Store** (`ui/vue/composer/stores/composerStore.ts`, `useComposerStore`) — a
  `shallowRef` read-model:
  - `toolbar`: projected settings + per-widget `visible` gating for model, mode,
    thinking budget, **effort level** (the `ThinkingBudgetSelector` renders an
    Effort control for adaptive-reasoning models — `isAdaptiveReasoningModel` —
    persisting `effortLevel` separately from `thinkingBudget`), service tier,
    permission, plan-mode, MCP, external-context, and the context-usage meter
    value.
  - `externalContext`: the active external-context path list, each entry
    `{ path, persistent }` — the `ExternalContextSelector` dropdown is not
    add-only; it lists active paths, removes them (`removePath()`), and toggles
    session-only vs persistent (`togglePersistence()`, saving
    `persistentExternalContextPaths`).
  - `wrapperMode`: the dynamic classes the engine currently toggles on
    `.specorator-input-wrapper` — `planMode` (`.specorator-input-plan-mode`, from
    `updatePlanModeUI()` / `refreshTabProviderUI()` / provider refresh),
    `instructionMode` (`.specorator-input-instruction-mode`) and `bangBashMode`
    (`.specorator-input-bang-bash-mode`, both from `TriggerInputMode.enter/exit`).
    `ComposerWrapper.vue` binds all three via `:class` so Vue owns the wrapper
    class list; the engine paths set the store flags instead of `classList.toggle`
    on the wrapper (imperative DOM write → reactive-data mutation — otherwise Vue's
    next patch clobbers the engine-toggled class and drops the plan-mode /
    instruction / bang-bash border). The active-mode **placeholder** stays
    engine-owned: `TriggerInputMode` keeps setting `inputEl.placeholder` directly
    on the engine-driven textarea (Vue never binds the textarea's attributes — see
    Textarea).
  - `inputMode`: `'none' | 'instruction' | 'bang-bash'` (from
    `InstructionModeManager` / `BangBashModeManager`) — drives the `wrapperMode`
    flags above.
  - `chips`: `currentNote` (the active-note pill, projected separately),
    `files[]`, `folders[]`, `images[]` (from `FileContextState` / image state —
    reactive `v-for`). `FileChipsView` receives `currentNote` apart from `files`
    and renders it as a `current` pill; folders are stored separately
    (`attachFolderAsPill()` / `getAttachedFolders()`) and render as
    `.specorator-file-chip--folder`. All chips **open the file on click**
    (`onOpenFile`) and are removable; removing the current-note pill must clear
    `currentNotePath` (so `shouldSendCurrentNote()` stops sending it) — the
    remove callback carries the pill kind so the engine clears the right state.
    The editor/browser/canvas **selection indicators**
    are NOT in the store: they are engine-driven element handles (the selection
    controllers mutate their `textContent`/`.specorator-hidden` directly — see
    Element-handle keys).
  - `mcp`: the enabled-server set the `McpServerSelector` owns — a list of
    `{ name, enabled }` plus visibility. It is not just an opener: it toggles
    per-server enablement, syncs `@server` mentions (`addMentionedServers()`), is
    restored via `setEnabledServers()`, and `InputController` sends
    `getEnabledServers()` with the turn. Project the list + enabled state; the Vue
    dropdown toggles via `onToggleMcpServer(name)`. Truth stays in the engine.
  - `editedFiles`: the edited-files projection (the kind-split counts **and** the
    grouped file list). `EditedFilesView` is interactive: the badge toggles a
    grouped popover, rows activate by click/keyboard, and `onOpenFile` re-resolves
    the created/edited file — so `EditedFilesBar.vue` is a popover with row
    activation, not a read-only count.
  - `streaming`: `isStreaming` — drives streaming-state chrome only (there is no
    send button; send/cancel stay keyboard-driven through `tabInputWiring`).
  - `dropdown`: `{ kind: 'slash' | 'mention' | 'resume' | null, items, activeIndex, anchorRect }`.
  - `draftMeta`: `isEmpty` + active mode only — **never the draft string** (the
    textarea's `.value` is engine-owned; see Textarea).
  All setters replace whole values. Truth + I/O stay in `InputController`,
  `ChatState`, `FileContextState`, the toolbar-setting owners, and the mode
  managers.
- **Projection** (`tabs/tabComposer.ts`, `TabComposerProjection`): the
  `ComposerCallbacks.subscribe` source. `SpecoratorView`/`Tab` still own the real
  engine callbacks (settings changes, context changes, streaming changes, mode
  changes, dropdown open/close); a single `emitComposerChange()` re-projects a
  `ComposerSnapshot` and fans it through the `ComposerSubscribe` seam that the
  event-routing composable subscribes to. Off-projection transients (dropdown
  anchor rect on caret move) use a `refresh*`-style targeted emit, mirroring the
  transcript's three emit points.
- **Callbacks** (`ui/vue/composer/composerCallbacks.ts`, `ComposerCallbacks`):
  thin Vue→engine delegators — `onSetModel`, `onSetMode`, `onSetThinkingBudget`,
  `onSetEffortLevel` (adaptive-reasoning models render an Effort control that
  persists a **different** settings field, `effortLevel`, via
  `onEffortLevelChange` — distinct from `onThinkingBudgetChange`/`thinkingBudget`),
  `onSetServiceTier`, `onSetPermission`, `onTogglePlanMode`,
  `onToggleMcpServer(name)`, `onAddExternalContext`,
  `onRemoveExternalContext(path)`, `onToggleExternalContextPersistence(path)`,
  `onRemoveChip(key, kind)` (kind `'current' | 'file' | 'folder' | 'image'`; `key`
  is the path for current/file/folder and the **attachment `id`** for images —
  `ImageContextManager` maps by generated `id` and `ImageAttachment.path` is
  optional until send, so a pasted/dropped image can only be removed by id; the
  engine clears `currentNotePath` for the active-note pill),
  `onOpenFile(path)` (open the clicked file/current/folder chip and edited-files
  row), `onOpenImage(id)` (the image thumbnail `.specorator-image-thumb` is
  click-to-open today — it opens the full-size preview via `openImageModal`, not
  just a remove target), `onDropdownNavigate`, `onDropdownSelect`,
  `onDropdownDismiss`, and the element-handle registration hooks. (There is no
  `onSend`/`onCancel` — send and Escape-cancel stay keyboard-driven through
  `tabInputWiring`.) **Emit timing**: adding an external context opens a native
  folder picker (`ExternalContextSelector.openFolderPicker` is async, awaiting
  `showOpenDialog`), so the composer re-projection hangs off the selector's
  `onChange` callback (fired after the dialog resolves and the path list mutates),
  never the click — else the new path stays invisible until an unrelated emit.
- **Element-handle keys** — Vue owns the composer DOM but hands the engine live
  nodes exactly as `SCROLL_HOST_KEY` did. The full set: `INPUT_EL_KEY` (the
  textarea), `NAV_ROW_KEY`, `CONTEXT_ROW_KEY`, `INPUT_CONTAINER_KEY`,
  `INPUT_WRAPPER_KEY`, `QUEUE_ROW_KEY` (the queued-follow-up row), and the three
  selection-indicator handles `SELECTION_INDICATOR_KEY`, `BROWSER_INDICATOR_KEY`,
  `CANVAS_INDICATOR_KEY`. Captured synchronously on mount and written to
  `tab.dom.*` (plus `state.queueIndicatorEl` for the queue row) so every existing
  consumer (`InputController`, `SelectionController` /
  `BrowserSelectionController` / `CanvasSelectionController`, `ChatDropController`,
  `InlinePromptController`, `QueuedMessageController`, `tabInputWiring`, the
  shell's `resolveNavRowEl` teleport) keeps its direct handle.
  - The **queued row** and the **selection indicators** are engine-built DOM
    (like the textarea): the controllers keep mutating the handed elements
    directly — `QueuedMessageController.updateQueueIndicator()` builds the queue
    row's contents, and the three selection controllers set each indicator's
    `textContent` + `.specorator-hidden`. Vue renders the host elements
    (`.specorator-input-queue-row`, `.specorator-selection-indicator`,
    `.specorator-browser-selection-indicator`, `.specorator-canvas-indicator`)
    and registers them; the controllers are **untouched**. (Reactive-ifying these
    is a possible later follow-up, out of scope here.)

### Component tree

```
ComposerRoot.vue                    (.specorator-input-container host; registers element handles; .specorator-vue baseline)
├── ComposerNavRow.vue              (.specorator-input-nav-row — teleport target the shell fills in 'input' mode; empty host otherwise)
├── ComposerQueueRow.vue            (.specorator-input-queue-row — engine-driven host; QueuedMessageController builds its DOM)
└── ComposerWrapper.vue             (.specorator-input-wrapper — ChatDropController overlay anchor)
    ├── ContextRow.vue              (.specorator-context-row)
    │   ├── FileChips.vue           (reactive v-for file chips + remove)
    │   ├── ImageChips.vue          (reactive v-for image previews + remove)
    │   └── SelectionIndicators.vue (engine-driven HOST: renders + registers the three
    │                                indicator elements; the selection controllers mutate them)
    ├── ComposerTextarea.vue        (<textarea class="specorator-input"> host — engine-driven)
    │   └── dropdowns/              (SlashCommandDropdown.vue, MentionDropdown.vue, ResumeSessionDropdown.vue — caret-anchored overlays)
    ├── EditedFilesBar.vue          (EditedFilesView port)
    └── ComposerToolbar.vue         (.specorator-input-toolbar)
        ├── ModelSelector.vue  ModeSelector.vue  ThinkingBudgetSelector.vue
        ├── ServiceTierToggle.vue  PermissionToggle.vue  PlanModeToggle.vue
        ├── McpServerSelector.vue  ExternalContextSelector.vue
        └── ContextUsageMeter.vue
```

> **No `SendButton.vue`.** The imperative composer has no send button today —
> sending is keyboard-only (`Enter` / `Mod+Enter` via `tabInputWiring`). Adding a
> visible send affordance would be new UX, not parity, so it is out of scope;
> send stays keyboard-driven and Escape-cancels during streaming as today.

- **Toolbar widgets** are leaf components: each reads its store slice and calls a
  callback on change. Provider gating is projected as a per-widget `visible`
  flag (from `applyProviderUIGating`/capabilities), so components render
  conditionally rather than re-deriving gating. Dropdown-driven widgets reuse the
  shell's Vue dropdown atoms + `--sp-*` tokens. `ExternalContextSelector.vue` is
  **not** add-only: its dropdown renders the active-path list from
  `store.externalContext`, removes a path (`onRemoveExternalContext`), and toggles
  session-only vs persistent per path (`onToggleExternalContextPersistence`) — full
  parity with the imperative selector. `McpServerSelector.vue` is likewise **not**
  just an opener: its dropdown lists `store.mcp` servers and toggles per-server
  enablement (`onToggleMcpServer`); the engine keeps the enabled-server truth
  (`addMentionedServers()` / `setEnabledServers()` / `getEnabledServers()` sent
  with the turn).
- **File/image chips** are reactive `v-for` over store arrays: `FileChipsView` /
  `ImageContextManager` are already view-over-state layers (they rebuild pills
  from `FileContextState` / image state), so the render moves to Vue while the
  underlying context *state* and all vault I/O stay in the engine and are
  projected into the store. `FileChips.vue` renders the **current-note pill**
  (`store.chips.currentNote`, a `current`-kind chip distinct from files), attached
  **files and folders** (folders as `.specorator-file-chip--folder`), and image
  previews. Every chip opens its file on click (`onOpenFile`) and is removable via
  `onRemoveChip(path, kind)`; removing the current-note pill clears
  `currentNotePath` (engine-side, keyed on `kind === 'current'`), so it is no
  longer sent by `shouldSendCurrentNote()`. **Contract**: `FileChips.vue` must
  render its chips inside a `.specorator-file-indicator` wrapper and
  `ImageChips.vue` inside a
  `.specorator-image-preview` wrapper, each toggling `.specorator-visible-flex`
  when non-empty (mirroring the legacy views) — the still-imperative
  `updateContextRowHasContent()` reads exactly those wrappers + that class to
  decide `.specorator-context-row.has-content` (see DOM contract).
- **Selection indicators** are NOT reactive: the three editor/browser/canvas
  indicator elements are engine-driven element handles. `SelectionIndicators.vue`
  renders the three host `<div>`s (with the legacy classes + initial
  `.specorator-hidden`) and registers them to `tab.dom.selectionIndicatorEl` /
  `browserIndicatorEl` / `canvasIndicatorEl`; the `SelectionController` /
  `BrowserSelectionController` / `CanvasSelectionController` keep mutating their
  `textContent` + `.specorator-hidden` directly, untouched.
- **`EditedFilesBar`** is an interactive popover (not read-only): a kind-split
  count badge that toggles a grouped popover (outside-click / Escape to close),
  with rows activatable by click/keyboard that call `onOpenFile(path)` to open the
  created/edited file — the only path to reach agent-changed files. **`ContextUsageMeter`**
  is a read-only projection.

### Textarea ownership (the one Vue-hostile surface)

The textarea is the composer's `MarkdownHost`: focus, caret, IME composition,
and caret-anchored dropdowns require one stable engine-driven element.

- **Vue renders the element; the engine owns its behavior.**
  `ComposerTextarea.vue` renders a single `<textarea class="specorator-input">`
  and hands the raw node to the engine via `INPUT_EL_KEY` on mount (captured
  synchronously). Vue **never** binds `v-model` to it and never re-renders it —
  its `.value`, height, and selection are opaque engine-owned state.
  `InputController` keeps reading/writing `.value`; `autoResizeTextarea` runs on
  input; `SelectionController` and `ChatDropController` attach listeners to the
  same node. A Vue-controlled `v-model` would disrupt IME composition and caret
  position; this contract avoids that entirely.
- **Keyboard wiring stays in `tabInputWiring`, unchanged.** The textarea-level
  `keydown` handler (the Mod+Enter explicit-send short-circuit that runs before
  the dropdown/resume/mention handlers, the `#`/`!` trigger keys, dropdown
  routing) and the vault-level `scope.register(['Mod'], 'Enter')` safety net both
  keep operating on the same real element with the existing
  `document.activeElement === inputEl`, `isComposing`, and `defaultPrevented`
  guards. Zero behavior change — the element is Vue-rendered rather than
  `createEl`'d.
- **Vue drives only the wrapper's surrounding chrome** from the store: the
  `wrapperMode` classes (plan / instruction / bang-bash) on `.specorator-input-wrapper`
  and streaming-state chrome — never the textarea's text, and **never its
  attributes**. The textarea `placeholder` is engine-owned (`TriggerInputMode` /
  `InputController` set `inputEl.placeholder` directly on the engine-driven node),
  and there is no `:disabled` binding — typing while streaming is allowed (queued
  follow-ups), so Vue touches the node only to register it via `INPUT_EL_KEY`.
- **Draft persistence** (`seedComposerDraft`, blank-tab drafts) stays entirely in
  `InputController`, which writes `.value` directly. The store projects only
  derived metadata (`isEmpty`, active mode) for chrome.

### Dropdowns

The slash/mention/resume dropdowns migrate to Vue **rendering** while the
engine keeps the trigger-detection + data-fetch state machine:

- `SlashCommandDropdown.vue`, `MentionDropdown.vue`, `ResumeSessionDropdown.vue`
  render as overlays inside `ComposerTextarea`'s host, positioned from the
  caret/textarea rect (`dropdown.anchorRect` in the store). The engine
  (`InputController` / `tabInputWiring`) detects the trigger, queries the
  provider command catalog / mention providers / resume sessions, and tracks the
  highlighted index. The store projects `{ kind, items, activeIndex, anchorRect }`;
  the component renders it and reports up/down/enter/escape navigation and
  click-select back through `onDropdownNavigate` / `onDropdownSelect` /
  `onDropdownDismiss`.
- **Keyboard-routing bridge (critical).** Keeping the textarea keydown wiring
  "unchanged" is not enough, because the objects it calls are being replaced.
  `tabInputWiring` routes Arrow/Enter/Escape through
  `ui.slashCommandDropdown?.handleKeydown(e)`, `ui.fileContextManager?.handleMentionKeydown(e)`,
  and `ui.slashCommandDropdown?.setEnabled(...)`, and `NavigationController`
  captures Escape first unless `shouldSkipEscapeHandling()` reports an active
  dropdown. So the `ComposerDropdownCoordinator` (the headless holder that keeps
  the trigger-detection) MUST expose the same interface those call sites expect —
  `handleKeydown(e): boolean` (navigate/select/dismiss, driving the store),
  `isVisible(): boolean` (so `shouldSkipEscapeHandling` still yields), and
  `setEnabled(b)` — and `ui.slashCommandDropdown` / `ui.fileContextManager` keep
  pointing at that headless bridge. Without it, Enter sends the message instead of
  selecting an item and Escape blurs the input instead of dismissing the Vue
  dropdown. The Vue components render from the store and do **not** add their own
  keyboard listeners (avoids double-handling).
- **Shared-component handling**: `shared/components/SlashCommandDropdown.ts` stays
  in place for `InlineEditModal`. The chat composer stops importing it and uses
  the new Vue component. To avoid a logic fork, the shared list-building /
  filtering / navigation helpers (`dropdownNavigation.ts`, catalog-query
  functions) are used as plain functions by both surfaces — two render surfaces,
  one behavior. `check:quality` clone detection is watched here; any duplication
  is resolved by extracting a shared helper, not by baseline bump.

### Data flow

```
User input / setting change
  -> Vue widget calls a ComposerCallbacks delegator
  -> existing InputController / settings setter / mode manager (engine truth + I/O)
  -> emitComposerChange() re-projects a ComposerSnapshot
  -> useComposerStore setters replace whole values
  -> Vue components re-render from the reactive store
```

One-way data, engine-owned truth — identical to the shell's header chrome and
the transcript's message projection.

## `.specorator-*` DOM contract & out-of-scope consumers

Vue owns the composer DOM, but these imperative consumers stay out of scope and
read it by class/element; the components must emit the exact legacy classes and
register the exact elements:

- `ChatDropController` — queries `.specorator-input-wrapper`; attaches the
  overlay to `.specorator-input-container`; focuses `inputEl`.
- `SelectionController` / `BrowserSelectionController` / `CanvasSelectionController`
  — receive `inputEl` + `contextRowEl` + their indicator element
  (`dom.selectionIndicatorEl` / `browserIndicatorEl` / `canvasIndicatorEl`,
  classes `.specorator-selection-indicator` / `.specorator-browser-selection-indicator`
  / `.specorator-canvas-indicator`) via `buildTabSelectionControllers`, and mutate
  each indicator's `textContent` + `.specorator-hidden` directly. The composer
  must render + register those three elements as engine-driven handles so the
  controllers (untouched) never hold a null or stale node.
- `InlinePromptController` — ref-counted toggle of `.specorator-hidden` on
  `.specorator-input-container` (the composer-hide during blocking prompts).
- `QueuedMessageController` — `updateQueueIndicator()` builds/clears the
  queued-follow-up UI inside `state.queueIndicatorEl` (the
  `.specorator-input-queue-row` element), rendering `.specorator-queue-indicator-text`
  / `.specorator-queue-indicator-actions` / `.specorator-queue-indicator-action`
  and the Steer-Now / edit / discard affordances during streaming sends.
- **Shell tab-strip teleport** — `resolveNavRowEl` returns `tab.dom.navRowEl`;
  the composer must keep a real `.specorator-input-nav-row` element registered
  there so `ChatHeader.vue`'s `'input'`-mode `<Teleport>` still targets it.
- `contextRowVisibility.updateContextRowHasContent()` (called from
  `selectionPollingBase` by the selection controllers on every poll) queries
  `.specorator-context-row` for `.specorator-selection-indicator` /
  `.specorator-browser-selection-indicator` / `.specorator-canvas-indicator`
  (checking `.specorator-hidden`) **and** `.specorator-file-indicator` /
  `.specorator-image-preview` (checking `.specorator-visible-flex`), then toggles
  `.has-content` on the context row. The reactive `FileChips.vue` /
  `ImageChips.vue` must therefore keep their `.specorator-file-indicator` /
  `.specorator-image-preview` wrappers and toggle `.specorator-visible-flex` when
  populated, or a selection poll can clear `has-content` and hide populated
  chips.
- `tabInputWiring` Mod+Enter textarea handler + vault scope — operate on the same
  `inputEl`.

`composerDomContract.test.ts` mounts the real `ComposerRoot` and asserts every
consumer-queried class + that all element handles — `inputEl` / `navRowEl` /
`queueIndicatorEl` / `contextRowEl` / `inputContainerEl` / `inputWrapperEl` /
`selectionIndicatorEl` / `browserIndicatorEl` / `canvasIndicatorEl` — are
registered to `tab.dom.*` (and `queueIndicatorEl` also to
`state.queueIndicatorEl`) as live nodes. It then drives
`QueuedMessageController.updateQueueIndicator()` against the Vue-rendered queue
row, a selection controller against its registered indicator, and
`updateContextRowHasContent()` against a populated `FileChips.vue` /
`ImageChips.vue` (asserting `.specorator-file-indicator` /
`.specorator-image-preview` carry `.specorator-visible-flex` and the context row
gains `.has-content`), to confirm the queued-follow-up UI, the selection pills,
and the context-row visibility all still work. It is the regression backstop
until the side-panels sub-project migrates those consumers.

## Testing

Vitest Vue lane (`tests/vue/chat/composer/`), characterization-first per
component (snapshot the legacy widget DOM, then assert Vue parity), following the
subagent-driven discipline (fail-before / pass-after regression tests for each
fix):

- **Toolbar widgets**: settings-projection renders the right state; a change
  fires the right callback; provider-gating `visible` flag hides the widget.
- **Dropdowns**: open/close/navigate/select driven by store state; keyboard
  parity with `dropdownNavigation`; caret-anchored positioning.
- **Textarea**: the element is handed to the engine on mount; Vue never clobbers
  `.value` / selection / IME state / `placeholder` (all engine-owned) and binds no
  `:disabled`; Mod+Enter still routes through `tabInputWiring`; the `wrapperMode`
  classes (plan / instruction / bang-bash) on `.specorator-input-wrapper` react to
  the store and survive an unrelated re-patch.
- **File/image chips**: reactive `v-for` parity; current-note pill rendered as
  `current` kind and opens on click; `onOpenFile` fires on chip click; remove
  callbacks fire with the right `kind` (current-note removal clears
  `currentNotePath`).
- **MCP + external-context + edited-files**: `onToggleMcpServer` toggles a
  server; `onRemoveExternalContext` / `onToggleExternalContextPersistence` act on
  a path; the edited-files popover opens and a row calls `onOpenFile`.
- **Selection indicators**: the three host elements are registered to
  `tab.dom.*`; a selection controller driving its registered indicator updates
  `textContent` + toggles `.specorator-hidden` (engine-driven, not reactive).
- **`composerDomContract.test.ts`**: the cross-surface lock described above.

Quality gates watched throughout: `check:loc` (net shrink as imperative widgets
delete), `check:quality` (dropdown clone groups — resolve by extraction),
`check:css` (`.specorator-vue` baseline + `--sp-*` tokens, no new `!important`,
the namespace guard), `typecheck:vue`, and the full Jest + Vitest suites.

## Migration discipline (Approach A)

One island, Vue owns all composer DOM, **per-component cutover** — each commit
migrates one component (or a small cohesive group) and deletes the imperative
widget it replaces, staying shippable. Ordering, lowest-risk first:

1. **Island scaffold**: `mountComposer`, Pinia, store, projection, callbacks,
   element-handle keys — including `QUEUE_ROW_KEY` (registered to both
   `tab.dom.queueIndicatorEl` and `state.queueIndicatorEl`) and the three
   selection-indicator keys (`SELECTION_INDICATOR_KEY` / `BROWSER_INDICATOR_KEY` /
   `CANVAS_INDICATOR_KEY`, registered to `tab.dom.selectionIndicatorEl` /
   `browserIndicatorEl` / `canvasIndicatorEl`) so `QueuedMessageController` and the
   selection controllers keep working untouched — mounted but rendering the
   still-imperative composer through the host, no widget migrated yet (proves the
   seam).
2. **Toolbar widgets** (nine leaf components + send) — chat-only, cleanest.
3. **Context chips + edited-files bar** (reactive, projected from context state).
   The **selection indicators** are host elements registered in Phase 1 (engine
   controllers mutate them); this task only renders/registers their host `<div>`s,
   it does not reactive-ify them.
4. **Textarea host** — the hard cutover (element handed to the engine; keyboard
   wiring re-pointed at the Vue-rendered node).
5. **Dropdowns** (slash / mention / resume) — rendering migrated, engine trigger
   detection retained; shared-helper extraction.
6. **Delete** the replaced imperative widgets + composer DOM assembly; re-lock
   ratchets; `composerDomContract.test.ts`; docs + ADR 0005 update + chat
   `CLAUDE.md`.

Dual-write is not used: the textarea's single-owner focus/caret model forces a
hard cutover on the riskiest piece regardless, so risk is isolated in a
well-tested commit rather than carried as two live composers throughout.

## End state

`ui/toolbar/*`, `InputToolbar.ts`, the `FileContext` / `ImageContext` view
layers, `EditedFilesView`, and the composer's imperative DOM assembly in
`tabUi` / `tabFactory` are deleted or reduced to state-only. `InputController`,
`tabInputWiring`, every controller, `ChatState`, and the provider/runtime
boundary are unchanged. The composer renders through a Vue 3 + Pinia island with
strict behavior parity, and the primary chat interaction loop (input →
transcript) is fully Vue. The only remaining imperative chat surface is the side
panels (the next sub-project).
