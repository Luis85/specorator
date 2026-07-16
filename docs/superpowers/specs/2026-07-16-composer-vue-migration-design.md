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
  slash/mention/resume dropdowns, and the send button — to a Vue 3 + Pinia
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
├── navRowEl      (.specorator-input-nav-row)        [SHELL teleports the tab strip here in 'input' tabBarPosition mode]
└── inputWrapper  (.specorator-input-wrapper)        [ChatDropController queries this for the drop overlay]
    ├── contextRowEl (.specorator-context-row)       [file/image chips + selection/browser/canvas indicators]
    ├── inputEl      (<textarea class="specorator-input">)   [the composer textarea]
    └── inputToolbar (.specorator-input-toolbar)      [the nine widgets, created in tabUi.ts]
```

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
    thinking budget, service tier, permission, plan-mode, MCP, external-context,
    and the context-usage meter value.
  - `inputMode`: `'none' | 'instruction' | 'bang-bash'` (from
    `InstructionModeManager` / `BangBashModeManager`) plus derived chrome flags.
  - `chips`: `files[]`, `images[]`, `selectionIndicators` (editor/browser/canvas).
  - `editedFiles`: the edited-files bar projection.
  - `send`: `canSend`, `isStreaming`, `sendLabel`.
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
  thin Vue→engine delegators — `onSend`, `onCancel`, `onSetModel`, `onSetMode`,
  `onSetThinkingBudget`, `onSetServiceTier`, `onSetPermission`, `onTogglePlanMode`,
  `onOpenMcpSelector`, `onAddExternalContext`, `onRemoveFileChip`,
  `onRemoveImageChip`, `onDropdownNavigate`, `onDropdownSelect`,
  `onDropdownDismiss`, and the element-handle registration hooks.
- **Element-handle keys** — Vue owns the composer DOM but hands the engine live
  nodes exactly as `SCROLL_HOST_KEY` did: `INPUT_EL_KEY` (the textarea),
  `NAV_ROW_KEY`, `CONTEXT_ROW_KEY`, `INPUT_CONTAINER_KEY`, `INPUT_WRAPPER_KEY`.
  Captured synchronously on mount and written to `tab.dom.*` so every existing
  consumer (`InputController`, `SelectionController`, `ChatDropController`,
  `InlinePromptController`, `tabInputWiring`, the shell's `resolveNavRowEl`
  teleport) keeps its direct handle.

### Component tree

```
ComposerRoot.vue                    (.specorator-input-container host; registers element handles; .specorator-vue baseline)
├── ComposerNavRow.vue              (.specorator-input-nav-row — teleport target the shell fills in 'input' mode; empty host otherwise)
└── ComposerWrapper.vue             (.specorator-input-wrapper — ChatDropController overlay anchor)
    ├── ContextRow.vue              (.specorator-context-row)
    │   ├── FileChips.vue           (v-for file chips + remove)
    │   ├── ImageChips.vue          (v-for image previews + remove)
    │   └── SelectionIndicators.vue (editor/browser/canvas pills)
    ├── ComposerTextarea.vue        (<textarea class="specorator-input"> host — engine-driven)
    │   └── dropdowns/              (SlashCommandDropdown.vue, MentionDropdown.vue, ResumeSessionDropdown.vue — caret-anchored overlays)
    ├── EditedFilesBar.vue          (EditedFilesView port)
    └── ComposerToolbar.vue         (.specorator-input-toolbar)
        ├── ModelSelector.vue  ModeSelector.vue  ThinkingBudgetSelector.vue
        ├── ServiceTierToggle.vue  PermissionToggle.vue  PlanModeToggle.vue
        ├── McpServerSelector.vue  ExternalContextSelector.vue
        ├── ContextUsageMeter.vue
        └── SendButton.vue
```

- **Toolbar widgets** are leaf components: each reads its store slice and calls a
  callback on change. Provider gating is projected as a per-widget `visible`
  flag (from `applyProviderUIGating`/capabilities), so components render
  conditionally rather than re-deriving gating. Dropdown-driven widgets reuse the
  shell's Vue dropdown atoms + `--sp-*` tokens.
- **Chips + indicators** are reactive `v-for` over store arrays. The underlying
  context *state* (`FileContextState`, image state) and all vault I/O stay in the
  engine and are projected into the store.
- **`EditedFilesBar`, `ContextUsageMeter`** are read-only projections.

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
- **Vue drives only surrounding chrome** from the store: placeholder,
  streaming-disabled state, and the active-input-mode class on the container —
  never the text content.
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
  — attach to `inputEl` + `contextRowEl` + indicator elements.
- `InlinePromptController` — ref-counted toggle of `.specorator-hidden` on
  `.specorator-input-container` (the composer-hide during blocking prompts).
- **Shell tab-strip teleport** — `resolveNavRowEl` returns `tab.dom.navRowEl`;
  the composer must keep a real `.specorator-input-nav-row` element registered
  there so `ChatHeader.vue`'s `'input'`-mode `<Teleport>` still targets it.
- `tabInputWiring` Mod+Enter textarea handler + vault scope — operate on the same
  `inputEl`.

`composerDomContract.test.ts` mounts the real `ComposerRoot` and asserts every
consumer-queried class + that `inputEl` / `navRowEl` / `contextRowEl` /
`inputContainerEl` / `inputWrapperEl` are registered to `tab.dom.*`. It is the
regression backstop until the side-panels sub-project migrates those consumers.

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
  `.value` / selection / IME state; Mod+Enter still routes through
  `tabInputWiring`; placeholder/disabled chrome reacts to the store.
- **Chips/indicators**: reactive `v-for` parity; remove callbacks fire.
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
   element-handle keys — mounted but rendering the still-imperative composer
   through the host, no widget migrated yet (proves the seam).
2. **Toolbar widgets** (nine leaf components + send) — chat-only, cleanest.
3. **Context chips + selection indicators + edited-files bar.**
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
