---
title: Migrate the chat composer + input toolbar to a Vue 3 + Pinia island
date: 2026-07-16
status: draft
scope: src/features/chat/ui/vue/composer (new), src/features/chat/tabs (composer DOM assembly + mount wiring), src/features/chat/ui/toolbar/*, InputToolbar, FileContext/ImageContext view layers, EditedFilesView
---

# Composer + Input Toolbar Vue Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the chat composer — textarea host, nine toolbar widgets, file/image context chips + selection indicators, edited-files bar, and the slash/mention/resume dropdowns (send stays keyboard-only — no send button exists today) — to a per-leaf Vue 3 + Pinia island under `src/features/chat/ui/vue/composer/`, with strict behavior parity and every cross-surface `.specorator-*` DOM contract preserved.

**Architecture:** One island per chat tab, mounted over the **untouched** imperative engine (`InputController`, `tabInputWiring`, controllers, `ChatState`, provider/runtime boundary), mirroring the shipped shell (sub-project 1) and transcript (sub-project 2) islands. A `shallowRef` read-model store is a projection of engine state; a per-tab `TabComposerProjection` fans a fully-projected `ComposerSnapshot` through a `subscribe` seam; a thin `ComposerCallbacks` contract delegates Vue→engine actions; element-handle injection keys let Vue own the composer DOM while the engine keeps live handles (`tab.dom.inputEl/navRowEl/contextRowEl/inputContainerEl/inputWrapper`). Vue never re-derives truth or performs I/O — it renders the store and reports actions back. Migration is **per-component cutover**: each commit migrates one leaf (or a small cohesive group) and deletes the imperative widget it replaces, staying shippable.

**Tech Stack:** Vue 3 (`<script setup>` SFCs), Pinia (`defineStore`, `shallowRef` whole-value setters), Vitest Vue lane (`npm run test:vue`, `tests/vue/chat/composer/`), Obsidian API, TypeScript. Island CSS uses the `.specorator-vue` baseline + `--sp-*` tokens and reuses the existing imperative composer stylesheets (the components emit the same `.specorator-*` classes); no new `!important`.

---

## Conventions for every task

- **Before the first task**, set the commit identity once per worktree:

  ```bash
  git config user.email noreply@anthropic.com && git config user.name Claude
  ```

- **Every commit message** in this plan ends with these two trailer lines (already shown in each Commit step):

  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_014VDsSXWHRqZr2EcNgDX2eq
  ```

- **Green bar for every task before committing** (run from repo root `/home/user/specorator`):

  ```bash
  npm run typecheck && npm run typecheck:vue && npm run lint && npm run test:vue && npm run build
  ```

  For tasks that touch Jest-lane engine code also run `npm run test -- --selectProjects unit`.
  For the final phase also run `npm run check:loc`, `npm run check:css`, and `npm run check:quality`.

- **Vue-surface tests** live in `tests/vue/chat/composer/` and run via `npm run test:vue`.

- **Island CSS**: `ComposerRoot`'s root carries the `.specorator-vue` baseline class so all descendants inherit the `--sp-*` token scope. The `styleBaseline.test.ts` token + namespace guards are scoped to `src/features/library` only, so — exactly like the shipped **transcript** island under `src/features/chat/ui/vue/transcript/` — the composer SFCs render the legacy `.specorator-*` contract classes as **static template classes** directly (the DOM contract requires the exact legacy classes; the transcript island's `domContract.test.ts` is the pattern). Reuse the existing imperative composer CSS (`src/style/components/input.css`, `src/style/toolbar/*`, `src/style/features/*`) unchanged — the components emit the same class names, so no new CSS is needed for parity. Any genuinely new scoped SFC style consumes `--sp-*` tokens only and adds no `!important`.

---

## The nine toolbar widgets and their store-projected `visible` gating (reference)

Projected once by `TabComposerProjection` and read by each leaf component (no re-derivation in Vue):

| Widget | Visible when | Contract root class |
|--------|--------------|---------------------|
| ModelSelector | always | `.specorator-model-selector` |
| ModeSelector | `getModeSelector(settings)` non-null AND `options.length === 2` | `.specorator-mode-selector` |
| ThinkingBudgetSelector | `reasoningControl !== 'none'` AND non-trivial options; effort vs budget by `isAdaptiveReasoningModel` | `.specorator-thinking-selector` |
| ServiceTierToggle | `getServiceTierToggle(settings)` non-null | `.specorator-service-tier-toggle` |
| PermissionToggle | `Boolean(getPermissionModeToggle())` | `.specorator-permission-toggle` |
| PlanModeToggle | `supportsPlanMode && Boolean(planValue) && Boolean(onPlanModeToggle)` | `.specorator-plan-mode-toggle` |
| McpServerSelector | `supportsMcpTools` AND ≥1 server | `.specorator-mcp-selector` |
| ExternalContextSelector | always | `.specorator-external-context-selector` |
| ContextUsageMeter | `usage && usage.contextTokens > 0` | `.specorator-context-meter` |

---

## Key architectural decision (verify at kickoff)

**Phase 1 migrates the composer's full structural shell to Vue with dedicated host elements for every not-yet-migrated leaf.** `ComposerRoot` renders `.specorator-input-container`, `.specorator-input-nav-row`, `.specorator-input-wrapper`, `.specorator-context-row`, the queue row (`.specorator-input-queue-row`), the edited-files row host, the textarea host, the toolbar host, and the three selection-indicator hosts — registering each raw node to `tab.dom.*` **synchronously on mount** (before the engine wiring that consumes them).

**Selection indicators (engine-driven host handles, never reactive-ified).** The editor/browser/canvas indicators (`.specorator-selection-indicator`, `.specorator-browser-selection-indicator`, `.specorator-canvas-indicator`) are created today in `tabUi.ts` inside `contextRowEl` and mutated directly (textContent + `.specorator-hidden`) by `SelectionController` / `BrowserSelectionController` / `CanvasSelectionController`, which are **out of scope and untouched**. They become three more element handles (`SELECTION_INDICATOR_KEY` / `BROWSER_INDICATOR_KEY` / `CANVAS_INDICATOR_KEY` → `tab.dom.selectionIndicatorEl` / `browserIndicatorEl` / `canvasIndicatorEl`). In Phase 3 `SelectionIndicators.vue` is a **non-reactive host** that renders the three `<div>`s with the legacy classes + initial `.specorator-hidden` and hands the raw nodes back; only `FileChips.vue` / `ImageChips.vue` (reactive `v-for` over projected context state) and `EditedFilesBar.vue` are reactive.

**Queue row (engine-driven host, never reactive-ified).** The queued-follow-up UI is built imperatively by `QueuedMessageController.updateQueueIndicator()` into `.specorator-input-queue-row` during streaming sends (called from `InputController`, `StreamController`, and the streaming indicator). It is a **sixth element handle**: `ComposerQueueRow.vue` renders the `.specorator-input-queue-row` host and registers the raw node — captured synchronously on mount — to **both** `tab.dom.queueIndicatorEl` (out-of-scope consumers) **and** `state.queueIndicatorEl` (ChatState) via a callback. `QueuedMessageController` stays **100% untouched**; it keeps building `.specorator-queue-indicator-text` / `.specorator-queue-indicator-actions` / `.specorator-queue-indicator-action` DOM into the handed element exactly like the engine-driven textarea. Reactive-ifying the queue row is an explicit out-of-scope follow-up. The still-imperative leaves (nine toolbar widgets, file/image chips, selection indicators, edited-files view, the textarea `<textarea>`) are built by the **unchanged** `initializeTabUI` / engine code INTO those Vue-registered host elements. Phases 2–5 then swap each imperative leaf for a Vue component rendered as a child of the already-Vue-owned host, deleting the imperative widget. This is the only clean way to do per-component cutover with mixed Vue/engine children (the shell island uses the identical "island hosts imperative widget" seam for its header dropdowns).

The textarea gets a dedicated host element in Phases 1–3 (`ComposerTextarea.vue` renders a layout-transparent `display: contents` host `<div>` that the engine populates with the `<textarea>`); Phase 4's hard cutover collapses that host by having `ComposerTextarea.vue` render the `<textarea class="specorator-input">` itself and register `INPUT_EL_KEY`, deleting the engine `createEl('textarea')`. **Rationale:** the textarea is the one Vue-hostile surface (IME/caret/focus); isolating its rendering cutover in a single well-tested Phase 4 commit — after the toolbar and chips are already Vue — keeps the risk contained, exactly as the design spec's "Approach A" prescribes.

---

# Phase 1 — Island scaffold (mount, Pinia, store, projection, callbacks, element handles)

Ends shippable with the composer rendered through the Vue island but **nothing migrated**: the island renders the structural shell and hosts the still-imperative toolbar widgets, chips, indicators, textarea, edited-files view, and queue row through element-handle hosts. Proves the seam.

### Task 1: Pinia + read-model store + injection keys

**Files:**
- Create: `src/features/chat/ui/vue/composer/composerPinia.ts`
- Create: `src/features/chat/ui/vue/composer/composerKeys.ts`
- Create: `src/features/chat/ui/vue/composer/stores/composerStore.ts`
- Test: `tests/vue/chat/composer/composerStore.test.ts`

- [ ] **Step 1: Write the Pinia factory**

`src/features/chat/ui/vue/composer/composerPinia.ts`:

```ts
import type { Pinia } from 'pinia';
import { createPinia } from 'pinia';

// A FRESH Pinia per chat leaf — NOT a shared module singleton. Each SpecoratorView
// tab owns its own composer input state; the plugin supports multiple open chat
// leaves. A shared `composer` store would let one leaf's projected toolbar/chips
// overwrite another's. Mirrors createTranscriptPinia. GC'd with the app on unmount.
export function createComposerPinia(): Pinia {
  return createPinia();
}
```

- [ ] **Step 2: Write the read-model store with the full slice shape**

`src/features/chat/ui/vue/composer/stores/composerStore.ts`:

```ts
import { defineStore } from 'pinia';
import { shallowRef } from 'vue';

// Same relative depth as transcriptStore.ts → core (stores/ is one level below the
// island root). Adjust if the path resolver disagrees.
import type { ProviderIconSvg } from '../../../../../../core/providers/types';

/** Toolbar model-picker option (mirrors the imperative `.specorator-model-option`).
 *  `providerIcon` is a `ProviderIconSvg` DESCRIPTOR (a `ProviderPathIconSvg |
 *  ProviderCompositeIconSvg` object), NOT an SVG string — rendered via
 *  `createProviderIconSvg` (never v-html). */
export interface ComposerModelOption { value: string; label: string; providerIcon?: ProviderIconSvg; }
/** A separator-labelled group of model options. */
export interface ComposerModelGroup { label: string | null; options: ComposerModelOption[]; }

export interface ComposerModeOption { value: string; label: string; description?: string; }
/** Two-position mode switch (`getModeSelector`); null hides the widget. */
export interface ComposerModeState {
  label: string; value: string; activeValue: string; active: boolean;
  title: string; options: ComposerModeOption[];
}

export interface ComposerReasoningOption { value: string; label: string; title?: string; }
/** One gear control: a label + current label + selectable options. */
export interface ComposerReasoningControl { label: string; current: string; options: ComposerReasoningOption[]; }
/** Reasoning: EXACTLY ONE of `budget`/`effort` is non-null (NEVER both), mirroring
 *  the imperative `ThinkingBudgetSelector.render` which shows a single control.
 *  BOTH are fed by the same `getReasoningOptions`; `isAdaptiveReasoningModel`
 *  picks which — adaptive models show `effort` (current = `effortLevel`; select →
 *  `onSetEffortLevel`), non-adaptive show `budget` (current = `thinkingBudget`;
 *  select → `onSetThinkingBudget`). A `reasoning` of `null` on the toolbar hides
 *  the widget entirely (reasoningControl 'none', empty options, or a lone
 *  default-valued option). */
export interface ComposerReasoningState {
  budget: ComposerReasoningControl | null;
  effort: ComposerReasoningControl | null;
}

export interface ComposerServiceTierState { active: boolean; activeValue: string; inactiveValue: string; }

export interface ComposerPermissionState {
  visible: boolean; label: string; active: boolean; planActive: boolean; switchVisible: boolean;
}
export interface ComposerPlanModeState { visible: boolean; active: boolean; }

export interface ComposerMcpServer { name: string; enabled: boolean; contextSaving: boolean; }
export interface ComposerMcpState { visible: boolean; count: number; servers: ComposerMcpServer[]; }

export interface ComposerExternalContextItem { path: string; persistent: boolean; }
export interface ComposerExternalContextState { count: number; items: ComposerExternalContextItem[]; }

export interface ComposerUsageState { percentage: number; tooltip: string; warning: boolean; }

/** Whole projected toolbar read-model. */
export interface ComposerToolbarState {
  modelLabel: string;
  modelGroups: ComposerModelGroup[];
  mode: ComposerModeState | null;
  reasoning: ComposerReasoningState | null;
  serviceTier: ComposerServiceTierState | null;
  permission: ComposerPermissionState | null;
  planMode: ComposerPlanModeState;
  mcp: ComposerMcpState;
  externalContext: ComposerExternalContextState;
  usage: ComposerUsageState | null;
}

export interface ComposerFileChip { path: string; label: string; kind: 'current' | 'file'; }
// Folders are stored + removed separately from files in the engine
// (`FileContextManager.attachFolderAsPill` / `FileContextState.getAttachedFolders`;
// `getPillData()` returns a distinct `folders: [...]`), so they are a separate
// projected array rendered as `.specorator-file-chip--folder`.
export interface ComposerFolderChip { path: string; label: string; }
export interface ComposerImageChip { id: string; name: string; sizeLabel: string; src: string; }
// NOTE: the editor/browser/canvas selection indicators are NOT projected here —
// they are engine-driven host elements (Phase 3 `SelectionIndicators.vue` hands
// the raw nodes to the untouched selection controllers, which mutate textContent
// + `.specorator-hidden` directly). Only current-note/file/folder + image chips
// are reactive. `currentNote` is projected + removed SEPARATELY from `files`:
// removing it clears `FileContextState.currentNotePath` so `shouldSendCurrentNote()`
// stops sending it.
export interface ComposerChips {
  currentNote: ComposerFileChip | null;
  files: ComposerFileChip[];
  folders: ComposerFolderChip[];
  images: ComposerImageChip[];
}

export interface ComposerEditedFile { path: string; changeKind: 'created' | 'edited'; name: string; dir: string; }

// Send is keyboard-only (Enter / Mod+Enter via tabInputWiring) — there is NO
// send button (strict parity). This slice carries ONLY the streaming flag, for
// streaming-state chrome. It never drives a button.
export interface ComposerStreamingState { isStreaming: boolean; }

export type ComposerDropdownKind = 'slash' | 'mention' | 'resume' | null;
export interface ComposerDropdownItem {
  id: string; primary: string; secondary?: string; hint?: string; modifier?: string;
  /** Per-type modifier class for mention items (e.g. 'agent', 'vault-folder'); optional. */
  variant?: string;
}
export interface ComposerDropdownAnchor { top: number; left: number; width: number; }
export interface ComposerDropdownState {
  kind: ComposerDropdownKind; items: ComposerDropdownItem[];
  activeIndex: number; anchorRect: ComposerDropdownAnchor | null;
}

export type ComposerInputMode = 'none' | 'instruction' | 'bang-bash';
export interface ComposerDraftMeta { isEmpty: boolean; activeMode: ComposerInputMode; }

/** The three (composable) wrapper-mode classes toggled on `.specorator-input-wrapper`:
 *  `.specorator-input-plan-mode` / `.specorator-input-instruction-mode` /
 *  `.specorator-input-bang-bash-mode`. Vue OWNS these classes (ComposerWrapper
 *  binds all three); the engine sets the flags via re-projection, never
 *  `classList.toggle` (else Vue's next patch drops them). The textarea PLACEHOLDER
 *  is NOT projected — it stays engine-owned (`TriggerInputMode` sets
 *  `inputEl.placeholder` directly on the engine-driven node). */
export interface ComposerWrapperMode { planMode: boolean; instructionMode: boolean; bangBashMode: boolean; }

const EMPTY_TOOLBAR: ComposerToolbarState = Object.freeze({
  modelLabel: '', modelGroups: [], mode: null, reasoning: null, serviceTier: null,
  permission: null, planMode: { visible: false, active: false },
  mcp: { visible: false, count: 0, servers: [] },
  externalContext: { count: 0, items: [] }, usage: null,
});
const EMPTY_CHIPS: ComposerChips = Object.freeze({ currentNote: null, files: [], folders: [], images: [] });
const EMPTY_STREAMING: ComposerStreamingState = Object.freeze({ isStreaming: false });
const EMPTY_DROPDOWN: ComposerDropdownState = Object.freeze({ kind: null, items: [], activeIndex: 0, anchorRect: null });
const EMPTY_DRAFT: ComposerDraftMeta = Object.freeze({ isEmpty: true, activeMode: 'none' });
const EMPTY_WRAPPER_MODE: ComposerWrapperMode = Object.freeze({ planMode: false, instructionMode: false, bangBashMode: false });

/**
 * Reactive read-model over one tab's composer. Truth + I/O stay in
 * InputController / ChatState / the toolbar-setting owners / the context + mode
 * managers; every setter replaces a whole value (shallowRef) so a change fires
 * the watch without deep-proxy overhead. Mirrors useTranscriptStore's contract.
 * NEVER holds the draft string — the textarea `.value` is engine-owned.
 */
export const useComposerStore = defineStore('composer', () => {
  const toolbar = shallowRef<ComposerToolbarState>(EMPTY_TOOLBAR);
  const chips = shallowRef<ComposerChips>(EMPTY_CHIPS);
  const editedFiles = shallowRef<ComposerEditedFile[]>([]);
  const streaming = shallowRef<ComposerStreamingState>(EMPTY_STREAMING);
  const dropdown = shallowRef<ComposerDropdownState>(EMPTY_DROPDOWN);
  const inputMode = shallowRef<ComposerInputMode>('none');
  const draftMeta = shallowRef<ComposerDraftMeta>(EMPTY_DRAFT);
  // Vue owns the three wrapper-mode classes on `.specorator-input-wrapper`
  // (ComposerWrapper binds them). Projected from permission mode + the mode
  // managers; the engine's former imperative `classList.toggle` calls are
  // removed (Task 4 / Task 5b).
  const wrapperMode = shallowRef<ComposerWrapperMode>(EMPTY_WRAPPER_MODE);

  function setToolbar(next: ComposerToolbarState): void { toolbar.value = next; }
  function setChips(next: ComposerChips): void { chips.value = next; }
  function setEditedFiles(next: ComposerEditedFile[]): void { editedFiles.value = next; }
  function setStreaming(next: ComposerStreamingState): void { streaming.value = next; }
  function setDropdown(next: ComposerDropdownState): void { dropdown.value = next; }
  function setInputMode(next: ComposerInputMode): void { inputMode.value = next; }
  function setDraftMeta(next: ComposerDraftMeta): void { draftMeta.value = next; }
  function setWrapperMode(next: ComposerWrapperMode): void { wrapperMode.value = next; }

  return {
    toolbar, chips, editedFiles, streaming, dropdown, inputMode, draftMeta, wrapperMode,
    setToolbar, setChips, setEditedFiles, setStreaming, setDropdown, setInputMode, setDraftMeta, setWrapperMode,
  };
});
```

- [ ] **Step 3: Write the injection keys**

`src/features/chat/ui/vue/composer/composerKeys.ts`:

```ts
import type { App, Component } from 'obsidian';
import type { InjectionKey } from 'vue';

import type SpecoratorPlugin from '../../../../../main';
import type { ComposerCallbacks } from './composerCallbacks';

export const APP_KEY: InjectionKey<App> = Symbol('specorator.composer.app');
export const COMPONENT_KEY: InjectionKey<Component> = Symbol('specorator.composer.component');
export const PLUGIN_KEY: InjectionKey<SpecoratorPlugin> = Symbol('specorator.composer.plugin');
export const CALLBACKS_KEY: InjectionKey<ComposerCallbacks> = Symbol('specorator.composer.callbacks');

// Element-handle keys — Vue owns the composer DOM but hands the engine live
// nodes exactly as SCROLL_HOST_KEY did in the transcript island. Each is a
// `(el) => void` provided by mountComposer that writes the raw node to
// `tab.dom.*` (and, for the queue row, ChatState). Captured SYNCHRONOUSLY in
// each host's onMounted (children mount before the parent, all during
// app.mount()), so every handle is registered before the engine wiring that
// consumes them runs.
export const INPUT_CONTAINER_KEY: InjectionKey<(el: HTMLElement) => void> = Symbol('specorator.composer.inputContainer');
export const NAV_ROW_KEY: InjectionKey<(el: HTMLElement) => void> = Symbol('specorator.composer.navRow');
export const INPUT_WRAPPER_KEY: InjectionKey<(el: HTMLElement) => void> = Symbol('specorator.composer.inputWrapper');
export const CONTEXT_ROW_KEY: InjectionKey<(el: HTMLElement) => void> = Symbol('specorator.composer.contextRow');
export const QUEUE_ROW_KEY: InjectionKey<(el: HTMLElement) => void> = Symbol('specorator.composer.queueRow');

// Internal wrapper-host keys for the leaves the engine still populates during
// migration. Removed as each leaf becomes a Vue component:
//   EDITED_FILES_ROW_KEY — removed in Phase 3 (EditedFilesBar.vue)
//   TOOLBAR_HOST_KEY      — removed in Phase 2 (ComposerToolbar.vue)
//   TEXTAREA_HOST_KEY     — removed in Phase 4, replaced by INPUT_EL_KEY
export const EDITED_FILES_ROW_KEY: InjectionKey<(el: HTMLElement) => void> = Symbol('specorator.composer.editedFilesRow');
export const TOOLBAR_HOST_KEY: InjectionKey<(el: HTMLElement) => void> = Symbol('specorator.composer.toolbarHost');
export const TEXTAREA_HOST_KEY: InjectionKey<(el: HTMLElement) => void> = Symbol('specorator.composer.textareaHost');
// Wired in Phase 4 when ComposerTextarea.vue renders the <textarea> itself.
export const INPUT_EL_KEY: InjectionKey<(el: HTMLTextAreaElement) => void> = Symbol('specorator.composer.inputEl');

// Selection-indicator host keys. The editor/browser/canvas indicators are
// ENGINE-DRIVEN: SelectionController / BrowserSelectionController /
// CanvasSelectionController (out of scope, untouched) mutate each indicator's
// textContent + `.specorator-hidden` directly. In Phase 3 `SelectionIndicators.vue`
// renders the three <div>s with the legacy classes + initial `.specorator-hidden`
// and hands the raw nodes back through these keys; it never reads the store.
export const SELECTION_INDICATOR_KEY: InjectionKey<(el: HTMLElement) => void> = Symbol('specorator.composer.selectionIndicator');
export const BROWSER_INDICATOR_KEY: InjectionKey<(el: HTMLElement) => void> = Symbol('specorator.composer.browserIndicator');
export const CANVAS_INDICATOR_KEY: InjectionKey<(el: HTMLElement) => void> = Symbol('specorator.composer.canvasIndicator');
```

- [ ] **Step 4: Write the failing store test**

`tests/vue/chat/composer/composerStore.test.ts`:

```ts
import { setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import { createComposerPinia } from '@/features/chat/ui/vue/composer/composerPinia';
import { useComposerStore } from '@/features/chat/ui/vue/composer/stores/composerStore';

describe('composer store', () => {
  beforeEach(() => setActivePinia(createComposerPinia()));

  it('starts with empty read-model slices', () => {
    const store = useComposerStore();
    expect(store.toolbar.modelLabel).toBe('');
    expect(store.chips.files).toEqual([]);
    expect(store.chips.folders).toEqual([]);
    expect(store.streaming.isStreaming).toBe(false);
    expect(store.dropdown.kind).toBeNull();
    expect(store.inputMode).toBe('none');
    expect(store.draftMeta.isEmpty).toBe(true);
  });

  it('replaces whole values through setters (no draft string ever held)', () => {
    const store = useComposerStore();
    store.setStreaming({ isStreaming: true });
    store.setInputMode('instruction');
    store.setChips({ currentNote: null, files: [{ path: 'a.md', label: 'a.md', kind: 'file' }], folders: [{ path: 'dir', label: 'dir/' }], images: [] });
    expect(store.streaming.isStreaming).toBe(true);
    expect(store.inputMode).toBe('instruction');
    expect(store.chips.files).toHaveLength(1);
    expect(store.chips.folders).toHaveLength(1);
    expect(store).not.toHaveProperty('draft');
  });

  it('createComposerPinia returns a fresh instance each call (per-leaf isolation)', () => {
    expect(createComposerPinia()).not.toBe(createComposerPinia());
  });
});
```

- [ ] **Step 5: Run the test — expect FAIL then PASS**

Run: `npm run test:vue -- composerStore`
Expected first run: FAIL (`Cannot find module '.../composerCallbacks'` referenced by `composerKeys.ts`). Add a minimal placeholder is NOT allowed — instead reorder: `composerKeys.ts` imports the type from `composerCallbacks.ts`, which is created in Task 2. To keep Task 1 self-contained, temporarily change the `composerKeys.ts` import to `import type { ComposerCallbacks } from './composerCallbacks';` and create `composerCallbacks.ts` with the full contract in Task 2. Until then, run only the store test which does not import keys:
Run: `npm run test:vue -- composerStore`
Expected: PASS (the store + pinia have no dependency on the keys/callbacks).

- [ ] **Step 6: Commit**

```bash
git add src/features/chat/ui/vue/composer/composerPinia.ts \
  src/features/chat/ui/vue/composer/composerKeys.ts \
  src/features/chat/ui/vue/composer/stores/composerStore.ts \
  tests/vue/chat/composer/composerStore.test.ts
git commit -m "$(cat <<'EOF'
feat(chat): scaffold composer Vue island store + injection keys

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014VDsSXWHRqZr2EcNgDX2eq
EOF
)"
```

> Note: `composerKeys.ts` will not typecheck until `composerCallbacks.ts` exists (Task 2). If you prefer a strictly-green intermediate commit, do Tasks 1 and 2 back-to-back before running the full `npm run typecheck`.

### Task 2: Callbacks contract + projection source + event routing

**Files:**
- Create: `src/features/chat/ui/vue/composer/composerCallbacks.ts`
- Create: `src/features/chat/tabs/tabComposer.ts`
- Create: `src/features/chat/ui/vue/composer/useComposerEventRouting.ts`
- Test: `tests/vue/chat/composer/tabComposer.test.ts`

- [ ] **Step 1: Write the callbacks + snapshot contract**

`src/features/chat/ui/vue/composer/composerCallbacks.ts`:

```ts
import type {
  ComposerChips,
  ComposerDropdownState,
  ComposerEditedFile,
  ComposerInputMode,
  ComposerStreamingState,
  ComposerToolbarState,
  ComposerDraftMeta,
  ComposerWrapperMode,
} from './stores/composerStore';

/** One projected snapshot the projection pushes on every composer-relevant
 *  engine change (settings, chips, streaming, mode, dropdown, edited files).
 *  Carries the whole read-model so every store field flows through the single
 *  `subscribe` channel — the engine has no direct handle to the store. */
export interface ComposerSnapshot {
  toolbar: ComposerToolbarState;
  chips: ComposerChips;
  editedFiles: ComposerEditedFile[];
  streaming: ComposerStreamingState;
  dropdown: ComposerDropdownState;
  inputMode: ComposerInputMode;
  draftMeta: ComposerDraftMeta;
  wrapperMode: ComposerWrapperMode;
}

export type ComposerSubscribe = (onChange: (s: ComposerSnapshot) => void) => () => void;

/**
 * Vue → engine seam for the composer island. Thin delegators to the tab's
 * controllers + the element-handle registration hooks. Vue never reaches into
 * the engine directly. Grows per migration phase (Phase 2 adds toolbar action
 * delegators, Phase 3 adds chip removers, Phase 5 adds dropdown navigation).
 */
export interface ComposerCallbacks {
  subscribe: ComposerSubscribe;

  // Element-handle registration (Vue owns the node; the engine keeps the handle).
  registerInputContainer: (el: HTMLElement) => void;
  registerNavRow: (el: HTMLElement) => void;
  registerInputWrapper: (el: HTMLElement) => void;
  registerContextRow: (el: HTMLElement) => void;
  registerQueueRow: (el: HTMLElement) => void;
  registerEditedFilesRow: (el: HTMLElement) => void;
  registerToolbarHost: (el: HTMLElement) => void;
  registerTextareaHost: (el: HTMLElement) => void;
}
// NOTE: there are no `onSend`/`onCancel` delegators — send is keyboard-only
// (Enter / Mod+Enter via tabInputWiring); no send button exists. Streaming is
// cancelled by Escape (tabInputWiring), unchanged.
```

- [ ] **Step 2: Write the per-tab projection source**

`src/features/chat/tabs/tabComposer.ts`:

```ts
import type SpecoratorPlugin from '../../../main';
import type {
  ComposerChips,
  ComposerDropdownState,
  ComposerEditedFile,
  ComposerInputMode,
  ComposerStreamingState,
  ComposerToolbarState,
  ComposerDraftMeta,
  ComposerWrapperMode,
} from '../ui/vue/composer/stores/composerStore';
import type { ComposerSnapshot, ComposerSubscribe } from '../ui/vue/composer/composerCallbacks';
import { getTabCapabilities, getTabPermissionMode } from './tabShared';
import type { TabData } from './types';

const EMPTY_TOOLBAR: ComposerToolbarState = {
  modelLabel: '', modelGroups: [], mode: null, reasoning: null, serviceTier: null,
  permission: null, planMode: { visible: false, active: false },
  mcp: { visible: false, count: 0, servers: [] },
  externalContext: { count: 0, items: [] }, usage: null,
};
const EMPTY_CHIPS: ComposerChips = { currentNote: null, files: [], folders: [], images: [] };
const EMPTY_DROPDOWN: ComposerDropdownState = { kind: null, items: [], activeIndex: 0, anchorRect: null };

/**
 * Per-tab projection source for the Vue composer island. Mirrors
 * `TabTranscriptProjection`: the engine mutates its own state (InputController,
 * ChatState, the toolbar-setting owners, the mode managers); this pushes a
 * fully-projected {@link ComposerSnapshot} to every observer registered through
 * {@link subscribe}. Slice builders are filled in per migration phase — Phase 1
 * projects send/inputMode/draftMeta; toolbar/chips/editedFiles/dropdown are
 * empty until their phases wire them.
 */
export class TabComposerProjection {
  private readonly observers = new Set<(s: ComposerSnapshot) => void>();

  constructor(
    private readonly tab: TabData,
    private readonly plugin: SpecoratorPlugin,
  ) {}

  readonly subscribe: ComposerSubscribe = (onChange) => {
    this.observers.add(onChange);
    onChange(this.snapshot());
    return () => {
      this.observers.delete(onChange);
    };
  };

  /** Re-projects and fans to every observer. No-op when nothing is mounted. */
  emit(): void {
    if (this.observers.size === 0) return;
    const snapshot = this.snapshot();
    for (const observer of this.observers) observer(snapshot);
  }

  private snapshot(): ComposerSnapshot {
    return {
      toolbar: this.buildToolbar(),              // Phase 2
      chips: this.buildChips(),                  // Phase 3
      editedFiles: this.buildEditedFiles(),      // Phase 3
      streaming: this.buildStreaming(),          // Phase 1
      dropdown: this.buildDropdown(),            // Phase 5
      inputMode: this.buildInputMode(),          // Phase 1
      draftMeta: this.buildDraftMeta(),          // Phase 1
      wrapperMode: this.buildWrapperMode(),      // Phase 1 (wrapper mode classes)
    };
  }

  // --- Phase 1 slices -------------------------------------------------------

  private buildStreaming(): ComposerStreamingState {
    return { isStreaming: this.tab.state.isStreaming };
  }

  // Vue owns the three wrapper-mode classes; the engine no longer toggles them
  // (Task 4 / Task 5b remove the imperative classList.toggle sites). planMode
  // derives from the permission mode gated by plan support; instruction /
  // bang-bash derive live from the mode managers' isActive().
  private buildWrapperMode(): ComposerWrapperMode {
    return {
      planMode: getTabPermissionMode(this.tab, this.plugin) === 'plan'
        && getTabCapabilities(this.tab, this.plugin).supportsPlanMode,
      instructionMode: this.tab.ui.instructionModeManager?.isActive() ?? false,
      bangBashMode: this.tab.ui.bangBashModeManager?.isActive() ?? false,
    };
  }

  private buildInputMode(): ComposerInputMode {
    if (this.tab.ui.instructionModeManager?.isActive()) return 'instruction';
    if (this.tab.ui.bangBashModeManager?.isActive()) return 'bang-bash';
    return 'none';
  }

  private buildDraftMeta(): ComposerDraftMeta {
    const isEmpty = (this.tab.dom.inputEl?.value ?? '').trim().length === 0;
    return { isEmpty, activeMode: this.buildInputMode() };
  }

  // --- Deferred slices (return empties until their phase fills them) ---------

  private buildToolbar(): ComposerToolbarState { return EMPTY_TOOLBAR; }
  private buildChips(): ComposerChips { return EMPTY_CHIPS; }
  private buildEditedFiles(): ComposerEditedFile[] { return []; }
  private buildDropdown(): ComposerDropdownState { return EMPTY_DROPDOWN; }
}
```

- [ ] **Step 3: Write the event-routing composable**

`src/features/chat/ui/vue/composer/useComposerEventRouting.ts`:

```ts
import { onScopeDispose } from 'vue';

import type { ComposerSubscribe } from './composerCallbacks';
import { useComposerStore } from './stores/composerStore';

/**
 * Routes the tab's composer-change stream into the Pinia store. The engine owns
 * the real callbacks and pushes a fully-projected ComposerSnapshot on every
 * change; this fans it into the store's setters and disposes on unmount.
 *
 * Subscribe SYNCHRONOUSLY during setup (not onMounted) so an emission that lands
 * in the same turn as mountComposer is not dropped while observers.size === 0.
 */
export function useComposerEventRouting(subscribe: ComposerSubscribe): void {
  const store = useComposerStore();
  const dispose = subscribe((snapshot) => {
    store.setToolbar(snapshot.toolbar);
    store.setChips(snapshot.chips);
    store.setEditedFiles(snapshot.editedFiles);
    store.setStreaming(snapshot.streaming);
    store.setDropdown(snapshot.dropdown);
    store.setInputMode(snapshot.inputMode);
    store.setDraftMeta(snapshot.draftMeta);
    store.setWrapperMode(snapshot.wrapperMode);
  });

  onScopeDispose(() => {
    dispose();
  });
}
```

- [ ] **Step 4: Write the failing projection test**

`tests/vue/chat/composer/tabComposer.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TabComposerProjection } from '@/features/chat/tabs/tabComposer';
import { getTabCapabilities, getTabPermissionMode } from '@/features/chat/tabs/tabShared';
import type { ComposerSnapshot } from '@/features/chat/ui/vue/composer/composerCallbacks';
import type { TabData } from '@/features/chat/tabs/types';
import type SpecoratorPlugin from '@/main';

// The projection derives wrapperMode.planMode from these two helpers; stub them
// so the unit test needs no real provider/registry wiring.
vi.mock('@/features/chat/tabs/tabShared', () => ({
  getTabPermissionMode: vi.fn(() => 'normal'),
  getTabCapabilities: vi.fn(() => ({ supportsPlanMode: true })),
}));

function makeTab(overrides: { streaming?: boolean; value?: string; instruction?: boolean } = {}): TabData {
  return {
    state: { isStreaming: overrides.streaming ?? false },
    dom: { inputEl: { value: overrides.value ?? '' } },
    ui: {
      instructionModeManager: { isActive: () => overrides.instruction ?? false },
      bangBashModeManager: { isActive: () => false },
    },
  } as unknown as TabData;
}

describe('TabComposerProjection', () => {
  beforeEach(() => {
    vi.mocked(getTabPermissionMode).mockReturnValue('normal');
    vi.mocked(getTabCapabilities).mockReturnValue({ supportsPlanMode: true } as never);
  });

  it('pushes the current snapshot immediately on subscribe', () => {
    const projection = new TabComposerProjection(makeTab({ value: 'hi' }), {} as SpecoratorPlugin);
    const seen: ComposerSnapshot[] = [];
    projection.subscribe((s) => seen.push(s));
    expect(seen).toHaveLength(1);
    expect(seen[0].streaming.isStreaming).toBe(false);
    expect(seen[0].draftMeta.isEmpty).toBe(false);
    expect(seen[0].inputMode).toBe('none');
    expect(seen[0].toolbar.modelLabel).toBe('');
    expect(seen[0].chips.folders).toEqual([]);
  });

  it('projects the streaming flag and the empty-draft meta', () => {
    const streaming = new TabComposerProjection(makeTab({ value: 'x', streaming: true }), {} as SpecoratorPlugin);
    const empty = new TabComposerProjection(makeTab({ value: '   ' }), {} as SpecoratorPlugin);
    let s1: ComposerSnapshot | null = null; let s2: ComposerSnapshot | null = null;
    streaming.subscribe((s) => (s1 = s));
    empty.subscribe((s) => (s2 = s));
    expect(s1!.streaming.isStreaming).toBe(true);
    expect(s2!.draftMeta.isEmpty).toBe(true);
  });

  it('projects wrapperMode.planMode from permission mode gated by plan support', () => {
    vi.mocked(getTabPermissionMode).mockReturnValue('plan');
    let on: ComposerSnapshot | null = null;
    new TabComposerProjection(makeTab(), {} as SpecoratorPlugin).subscribe((s) => (on = s));
    expect(on!.wrapperMode.planMode).toBe(true);

    vi.mocked(getTabCapabilities).mockReturnValue({ supportsPlanMode: false } as never);
    let off: ComposerSnapshot | null = null;
    new TabComposerProjection(makeTab(), {} as SpecoratorPlugin).subscribe((s) => (off = s));
    expect(off!.wrapperMode.planMode).toBe(false);
  });

  it('projects wrapperMode.instructionMode from the mode managers', () => {
    let snap: ComposerSnapshot | null = null;
    new TabComposerProjection(makeTab({ instruction: true }), {} as SpecoratorPlugin).subscribe((s) => (snap = s));
    expect(snap!.wrapperMode.instructionMode).toBe(true);
    expect(snap!.wrapperMode.bangBashMode).toBe(false);
  });

  it('projects the active input mode from the mode managers', () => {
    const projection = new TabComposerProjection(makeTab({ instruction: true }), {} as SpecoratorPlugin);
    let snap: ComposerSnapshot | null = null;
    projection.subscribe((s) => (snap = s));
    expect(snap!.inputMode).toBe('instruction');
    expect(snap!.draftMeta.activeMode).toBe('instruction');
  });

  it('emit fans to every observer; disposer removes it', () => {
    const projection = new TabComposerProjection(makeTab(), {} as SpecoratorPlugin);
    const a = vi.fn(); const b = vi.fn();
    const disposeA = projection.subscribe(a);
    projection.subscribe(b);
    a.mockClear(); b.mockClear();
    projection.emit();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    disposeA();
    a.mockClear();
    projection.emit();
    expect(a).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 5: Run — expect FAIL first (files absent) then PASS after Steps 1–3**

Run: `npm run test:vue -- tabComposer`
Expected: PASS (4 tests). Also run `npm run typecheck && npm run typecheck:vue` — now green because `composerCallbacks.ts` exists (unblocking `composerKeys.ts` from Task 1).

- [ ] **Step 6: Commit**

```bash
git add src/features/chat/ui/vue/composer/composerCallbacks.ts \
  src/features/chat/tabs/tabComposer.ts \
  src/features/chat/ui/vue/composer/useComposerEventRouting.ts \
  tests/vue/chat/composer/tabComposer.test.ts
git commit -m "$(cat <<'EOF'
feat(chat): add composer projection source + callbacks contract + event routing

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014VDsSXWHRqZr2EcNgDX2eq
EOF
)"
```

### Task 3: `mountComposer` + `ComposerRoot` + structural-shell host SFCs

**Files:**
- Create: `src/features/chat/ui/vue/composer/mountComposer.ts`
- Create: `src/features/chat/ui/vue/composer/ComposerRoot.vue`
- Create: `src/features/chat/ui/vue/composer/components/ComposerQueueRow.vue`
- Create: `src/features/chat/ui/vue/composer/components/ComposerNavRow.vue`
- Create: `src/features/chat/ui/vue/composer/components/ComposerWrapper.vue`
- Create: `src/features/chat/ui/vue/composer/components/ComposerEditedFilesRow.vue`
- Create: `src/features/chat/ui/vue/composer/components/ComposerContextRow.vue`
- Create: `src/features/chat/ui/vue/composer/components/ComposerTextarea.vue`
- Create: `src/features/chat/ui/vue/composer/components/ComposerToolbar.vue`
- Test: `tests/vue/chat/composer/mountComposer.test.ts`

- [ ] **Step 1: Write `mountComposer`**

`src/features/chat/ui/vue/composer/mountComposer.ts`:

```ts
import type { Component } from 'obsidian';
import { type App as VueApp, createApp, markRaw } from 'vue';

import type SpecoratorPlugin from '../../../../../main';
import type { ComposerCallbacks } from './composerCallbacks';
import ComposerRoot from './ComposerRoot.vue';
import { createComposerPinia } from './composerPinia';
import {
  APP_KEY, CALLBACKS_KEY, COMPONENT_KEY, PLUGIN_KEY,
  CONTEXT_ROW_KEY, EDITED_FILES_ROW_KEY, INPUT_CONTAINER_KEY, INPUT_WRAPPER_KEY,
  NAV_ROW_KEY, QUEUE_ROW_KEY, TEXTAREA_HOST_KEY, TOOLBAR_HOST_KEY,
} from './composerKeys';

/** Handle to a per-tab mounted composer island. */
export interface MountedComposer {
  app: VueApp;
  unmount: () => void;
}

/**
 * Mounts the Vue composer island for one chat tab. Per-tab mirror of
 * `mountTranscript`: a FRESH per-leaf Pinia (never a shared singleton — each tab
 * owns its own input state), the App/Component/Plugin/Callbacks provides, and the
 * element-handle keys wired to `callbacks.register*`. The host SFCs invoke those
 * registers in their `onMounted` (children mount before the parent, all during
 * `app.mount()`), so every `tab.dom.*` handle is set before this returns.
 *
 * `markRaw` on the Obsidian objects: they are large and cyclic — never deep-proxy.
 */
export function mountComposer(
  containerEl: HTMLElement,
  plugin: SpecoratorPlugin,
  component: Component,
  callbacks: ComposerCallbacks,
): MountedComposer {
  const app = createApp(ComposerRoot);
  app.use(createComposerPinia());
  app.provide(APP_KEY, markRaw(plugin.app));
  app.provide(COMPONENT_KEY, markRaw(component));
  app.provide(PLUGIN_KEY, markRaw(plugin));
  app.provide(CALLBACKS_KEY, markRaw(callbacks));
  app.provide(INPUT_CONTAINER_KEY, callbacks.registerInputContainer);
  app.provide(NAV_ROW_KEY, callbacks.registerNavRow);
  app.provide(INPUT_WRAPPER_KEY, callbacks.registerInputWrapper);
  app.provide(CONTEXT_ROW_KEY, callbacks.registerContextRow);
  app.provide(QUEUE_ROW_KEY, callbacks.registerQueueRow);
  app.provide(EDITED_FILES_ROW_KEY, callbacks.registerEditedFilesRow);
  app.provide(TOOLBAR_HOST_KEY, callbacks.registerToolbarHost);
  app.provide(TEXTAREA_HOST_KEY, callbacks.registerTextareaHost);
  app.mount(containerEl);

  return { app, unmount: () => app.unmount() };
}
```

- [ ] **Step 2: Write `ComposerRoot.vue` (island root + container handle + event routing)**

`src/features/chat/ui/vue/composer/ComposerRoot.vue`:

```vue
<script setup lang="ts">
import { inject, onMounted, ref } from 'vue';

import ComposerNavRow from './components/ComposerNavRow.vue';
import ComposerQueueRow from './components/ComposerQueueRow.vue';
import ComposerWrapper from './components/ComposerWrapper.vue';
import { CALLBACKS_KEY, INPUT_CONTAINER_KEY } from './composerKeys';
import { useComposerEventRouting } from './useComposerEventRouting';

// Subscribe synchronously during setup so a same-turn emit is not dropped.
const callbacks = inject(CALLBACKS_KEY, undefined);
if (callbacks) {
  useComposerEventRouting(callbacks.subscribe);
}

// Vue owns `.specorator-input-container`; the engine keeps a direct handle
// (InlinePromptController's `.specorator-hidden` toggle + ChatDropController's
// overlay attach). `nodeType === 1` (not `instanceof HTMLElement`) so a popout
// window's own constructor doesn't fail the guard — see mountIcon.ts.
const containerEl = ref<HTMLElement | null>(null);
const registerContainer = inject(INPUT_CONTAINER_KEY, undefined);
onMounted(() => {
  if (containerEl.value && containerEl.value.nodeType === 1 && registerContainer) {
    registerContainer(containerEl.value);
  }
});
</script>

<template>
  <div
    ref="containerEl"
    class="specorator-input-container specorator-vue"
  >
    <ComposerQueueRow />
    <ComposerNavRow />
    <ComposerWrapper />
  </div>
</template>
```

- [ ] **Step 3: Write the queue-row host (`ComposerQueueRow.vue`)**

`src/features/chat/ui/vue/composer/components/ComposerQueueRow.vue`:

```vue
<script setup lang="ts">
import { inject, onMounted, ref } from 'vue';

import { QUEUE_ROW_KEY } from '../composerKeys';

// Engine-driven host: QueuedMessageController.updateQueueIndicator() builds
// `.specorator-queue-indicator-*` DOM into this element and toggles its
// visibility directly. Vue never renders its children (no v-for). The register
// callback writes the raw node to BOTH tab.dom.queueIndicatorEl and
// state.queueIndicatorEl (see tabComposerMount).
const el = ref<HTMLElement | null>(null);
const register = inject(QUEUE_ROW_KEY, undefined);
onMounted(() => {
  if (el.value && el.value.nodeType === 1 && register) register(el.value);
});
</script>

<template>
  <div
    ref="el"
    class="specorator-input-queue-row"
  />
</template>
```

- [ ] **Step 4: Write the nav-row host (`ComposerNavRow.vue`)**

`src/features/chat/ui/vue/composer/components/ComposerNavRow.vue`:

```vue
<script setup lang="ts">
import { inject, onMounted, ref } from 'vue';

import { NAV_ROW_KEY } from '../composerKeys';

// The shell's ChatHeader teleports the tab strip into this element in 'input'
// tabBarPosition mode (resolveNavRowEl returns tab.dom.navRowEl). Empty host:
// Vue never renders children here.
const el = ref<HTMLElement | null>(null);
const register = inject(NAV_ROW_KEY, undefined);
onMounted(() => {
  if (el.value && el.value.nodeType === 1 && register) register(el.value);
});
</script>

<template>
  <div
    ref="el"
    class="specorator-input-nav-row"
  />
</template>
```

- [ ] **Step 5: Write the wrapper (`ComposerWrapper.vue`)**

`src/features/chat/ui/vue/composer/components/ComposerWrapper.vue`:

```vue
<script setup lang="ts">
import { inject, onMounted, ref } from 'vue';

import ComposerContextRow from './ComposerContextRow.vue';
import ComposerEditedFilesRow from './ComposerEditedFilesRow.vue';
import ComposerTextarea from './ComposerTextarea.vue';
import ComposerToolbar from './ComposerToolbar.vue';
import { INPUT_WRAPPER_KEY } from '../composerKeys';
import { useComposerStore } from '../stores/composerStore';

const store = useComposerStore();

// ChatDropController queries `.specorator-input-wrapper` for the drop overlay
// and binds its listeners there. Vue OWNS the three wrapper-mode classes
// (formerly imperative `dom.inputWrapper.toggleClass(...)` in plan / instruction
// / bang-bash paths); the store is the single owner so a re-patch can't drop them.
const el = ref<HTMLElement | null>(null);
const register = inject(INPUT_WRAPPER_KEY, undefined);
onMounted(() => {
  if (el.value && el.value.nodeType === 1 && register) register(el.value);
});
</script>

<template>
  <div
    ref="el"
    class="specorator-input-wrapper"
    :class="{
      'specorator-input-plan-mode': store.wrapperMode.planMode,
      'specorator-input-instruction-mode': store.wrapperMode.instructionMode,
      'specorator-input-bang-bash-mode': store.wrapperMode.bangBashMode,
    }"
  >
    <ComposerEditedFilesRow />
    <ComposerContextRow />
    <ComposerTextarea />
    <ComposerToolbar />
  </div>
</template>
```

- [ ] **Step 6: Write the edited-files, context-row, textarea, and toolbar hosts**

`src/features/chat/ui/vue/composer/components/ComposerEditedFilesRow.vue`:

```vue
<script setup lang="ts">
import { inject, onMounted, ref } from 'vue';

import { EDITED_FILES_ROW_KEY } from '../composerKeys';

// Engine host until Phase 3: EditedFilesView renders `.specorator-edited-files*`
// into this element and self-manages `.specorator-hidden`.
const el = ref<HTMLElement | null>(null);
const register = inject(EDITED_FILES_ROW_KEY, undefined);
onMounted(() => {
  if (el.value && el.value.nodeType === 1 && register) register(el.value);
});
</script>

<template>
  <div
    ref="el"
    class="specorator-edited-files-row"
  />
</template>
```

`src/features/chat/ui/vue/composer/components/ComposerContextRow.vue`:

```vue
<script setup lang="ts">
import { inject, onMounted, ref } from 'vue';

import { CONTEXT_ROW_KEY } from '../composerKeys';

// Engine host until Phase 3: FileChipsView (`.specorator-file-indicator`),
// ImageContextManager (`.specorator-image-preview`), and the three selection
// indicators are created into this element by initializeTabUI. Empty Vue host.
const el = ref<HTMLElement | null>(null);
const register = inject(CONTEXT_ROW_KEY, undefined);
onMounted(() => {
  if (el.value && el.value.nodeType === 1 && register) register(el.value);
});
</script>

<template>
  <div
    ref="el"
    class="specorator-context-row"
  />
</template>
```

`src/features/chat/ui/vue/composer/components/ComposerTextarea.vue`:

```vue
<script setup lang="ts">
import { inject, onMounted, ref } from 'vue';

import { TEXTAREA_HOST_KEY } from '../composerKeys';

// Phase 1–3 host: the engine `<textarea class="specorator-input">` is appended
// into this element (registerTextareaHost). `display: contents` makes the host
// layout-transparent so the textarea participates in `.specorator-input-wrapper`
// flow exactly as when it was a direct child. Phase 4 collapses this: the SFC
// renders the <textarea> itself and registers INPUT_EL_KEY instead.
const el = ref<HTMLElement | null>(null);
const register = inject(TEXTAREA_HOST_KEY, undefined);
onMounted(() => {
  if (el.value && el.value.nodeType === 1 && register) register(el.value);
});
</script>

<template>
  <div
    ref="el"
    class="specorator-vue-composer-textarea-host"
  />
</template>

<style scoped>
.specorator-vue-composer-textarea-host {
  display: contents;
}
</style>
```

`src/features/chat/ui/vue/composer/components/ComposerToolbar.vue`:

```vue
<script setup lang="ts">
import { inject, onMounted, ref } from 'vue';

import { TOOLBAR_HOST_KEY } from '../composerKeys';

// Phase 1 host: createInputToolbar builds the nine `.specorator-*-selector` /
// `.specorator-*-toggle` widgets into this element. Phase 2 replaces this with
// reactive child components (no send button — send is keyboard-only).
const el = ref<HTMLElement | null>(null);
const register = inject(TOOLBAR_HOST_KEY, undefined);
onMounted(() => {
  if (el.value && el.value.nodeType === 1 && register) register(el.value);
});
</script>

<template>
  <div
    ref="el"
    class="specorator-input-toolbar"
  />
</template>
```

- [ ] **Step 7: Write the failing mount test**

`tests/vue/chat/composer/mountComposer.test.ts`:

```ts
import { flushPromises } from '@vue/test-utils';
import { App, Component } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mountComposer } from '@/features/chat/ui/vue/composer/mountComposer';
import type { ComposerCallbacks } from '@/features/chat/ui/vue/composer/composerCallbacks';
import type SpecoratorPlugin from '@/main';

function makePlugin(): SpecoratorPlugin {
  return { app: new App(), settings: {} } as unknown as SpecoratorPlugin;
}

function makeCallbacks(): { callbacks: ComposerCallbacks; registered: Record<string, HTMLElement | null> } {
  const registered: Record<string, HTMLElement | null> = {
    container: null, navRow: null, wrapper: null, contextRow: null,
    queueRow: null, editedFilesRow: null, toolbarHost: null, textareaHost: null,
  };
  const callbacks: ComposerCallbacks = {
    subscribe: (onChange) => {
      onChange({
        toolbar: { modelLabel: '', modelGroups: [], mode: null, reasoning: null, serviceTier: null, permission: null, planMode: { visible: false, active: false }, mcp: { visible: false, count: 0, servers: [] }, externalContext: { count: 0, items: [] }, usage: null },
        chips: { currentNote: null, files: [], folders: [], images: [] },
        editedFiles: [], streaming: { isStreaming: false },
        dropdown: { kind: null, items: [], activeIndex: 0, anchorRect: null },
        inputMode: 'none', draftMeta: { isEmpty: true, activeMode: 'none' },
        wrapperMode: { planMode: false, instructionMode: false, bangBashMode: false },
      });
      return () => {};
    },
    registerInputContainer: (el) => { registered.container = el; },
    registerNavRow: (el) => { registered.navRow = el; },
    registerInputWrapper: (el) => { registered.wrapper = el; },
    registerContextRow: (el) => { registered.contextRow = el; },
    registerQueueRow: (el) => { registered.queueRow = el; },
    registerEditedFilesRow: (el) => { registered.editedFilesRow = el; },
    registerToolbarHost: (el) => { registered.toolbarHost = el; },
    registerTextareaHost: (el) => { registered.textareaHost = el; },
  };
  return { callbacks, registered };
}

describe('mountComposer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the structural shell and registers every element handle synchronously on mount', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { callbacks, registered } = makeCallbacks();

    const mounted = mountComposer(container, makePlugin(), new Component(), callbacks);

    // Registered before flushPromises — captured during app.mount().
    expect(registered.container).toBe(container.querySelector('.specorator-input-container'));
    expect(registered.navRow).toBe(container.querySelector('.specorator-input-nav-row'));
    expect(registered.wrapper).toBe(container.querySelector('.specorator-input-wrapper'));
    expect(registered.contextRow).toBe(container.querySelector('.specorator-context-row'));
    expect(registered.queueRow).toBe(container.querySelector('.specorator-input-queue-row'));
    expect(registered.editedFilesRow).toBe(container.querySelector('.specorator-edited-files-row'));
    expect(registered.toolbarHost).toBe(container.querySelector('.specorator-input-toolbar'));
    expect(registered.textareaHost).toBe(container.querySelector('.specorator-vue-composer-textarea-host'));

    // Baseline token scope + drop-query target present.
    expect(container.querySelector('.specorator-input-container')!.classList.contains('specorator-vue')).toBe(true);

    await flushPromises();
    mounted.unmount();
    container.remove();
  });
});
```

- [ ] **Step 8: Run — expect FAIL first then PASS**

Run: `npm run test:vue -- mountComposer`
Expected: PASS (1 test — all 8 handles registered, shell present).

- [ ] **Step 9: Commit**

```bash
git add src/features/chat/ui/vue/composer/mountComposer.ts \
  src/features/chat/ui/vue/composer/ComposerRoot.vue \
  src/features/chat/ui/vue/composer/components/ \
  tests/vue/chat/composer/mountComposer.test.ts
git commit -m "$(cat <<'EOF'
feat(chat): mount composer island shell hosting the imperative composer DOM

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014VDsSXWHRqZr2EcNgDX2eq
EOF
)"
```

### Task 4: Refactor `buildTabDOM` + wire `mountComposer` into tab creation

**Files:**
- Modify: `src/features/chat/tabs/types.ts` (add `composerHostEl`, `toolbarHostEl` to `TabDOMElements`; add `composer`, `mountedComposer` to `TabData`)
- Modify: `src/features/chat/tabs/tabFactory.ts` (`buildTabDOM`, `createTab` ui-map init)
- Create: `src/features/chat/tabs/tabComposerMount.ts`
- Modify: `src/features/chat/tabs/tabUi.ts` (`initializeInputToolbar` toolbar-host source)
- Modify: `src/features/chat/tabs/TabManager.ts` (call `mountTabComposer` between `createTab` and `initializeTabUI`)
- Test: `tests/vue/chat/composer/tabComposerMount.test.ts`

- [ ] **Step 1: Extend the DOM + tab types**

In `src/features/chat/tabs/types.ts`, add to `TabDOMElements` (after `contentEl`):

```ts
  /** Vue composer island mount target (a bare child of contentEl). The island
   *  renders the composer structural DOM into it and hands the real elements
   *  back through element-handle keys. */
  composerHostEl: HTMLElement;
```

and after `contextRowEl`:

```ts
  /** Toolbar host the Vue island renders (`.specorator-input-toolbar`); the
   *  imperative `createInputToolbar` builds into it until Phase 2. */
  toolbarHostEl: HTMLElement;
```

In `TabData` (after `mountedTranscript`):

```ts
  /** Per-tab Vue composer projection source (engine → store snapshot fan-out). */
  composer: TabComposerProjection | null;

  /** Handle to the mounted Vue composer island (unmounted on tab destroy). */
  mountedComposer: MountedComposer | null;
```

and add the imports at the top of `types.ts`:

```ts
import type { MountedComposer } from '../ui/vue/composer/mountComposer';
import type { TabComposerProjection } from './tabComposer';
```

- [ ] **Step 2: Refactor `buildTabDOM`**

Replace `buildTabDOM` in `src/features/chat/tabs/tabFactory.ts` with:

```ts
function buildTabDOM(contentEl: HTMLElement): TabDOMElements {
  const messagesWrapperEl = contentEl.createDiv({ cls: 'specorator-messages-wrapper' });
  // The Vue transcript island renders `.specorator-messages` into this wrapper.
  const messagesEl = messagesWrapperEl;
  const statusPanelContainerEl = contentEl.createDiv({ cls: 'specorator-status-panel-container' });

  // The Vue composer island mounts into this host and renders the composer
  // structural DOM (`.specorator-input-container` and its children), handing the
  // real elements back through element-handle keys (mountTabComposer). Until then
  // the composer element fields point at this host as non-null placeholders; no
  // consumer reads them before the mount registers the real Vue nodes.
  const composerHostEl = contentEl.createDiv({ cls: 'specorator-composer-host' });

  // The composer textarea is created detached here (so InputController/history
  // restore/seedComposerDraft keep a stable engine-owned node) and appended into
  // the Vue `ComposerTextarea` host on mount (registerTextareaHost). Phase 4
  // moves its rendering into Vue and deletes this line.
  const inputEl = createEl('textarea', {
    cls: 'specorator-input',
    attr: { placeholder: 'How can i help you today?', rows: '3', dir: 'auto' },
  });

  return {
    contentEl,
    messagesEl,
    statusPanelContainerEl,
    composerHostEl,
    inputContainerEl: composerHostEl,
    queueIndicatorEl: composerHostEl,
    inputWrapper: composerHostEl,
    inputEl,
    navRowEl: composerHostEl,
    editedFilesRowEl: composerHostEl,
    contextRowEl: composerHostEl,
    toolbarHostEl: composerHostEl,
    selectionIndicatorEl: null,
    browserIndicatorEl: null,
    canvasIndicatorEl: null,
    eventCleanups: [],
  };
}
```

Add `createEl` to the obsidian import at the top of `tabFactory.ts` if not already imported (it is a global in Obsidian; if the project imports DOM helpers explicitly, follow the existing pattern in the file — otherwise `document.createElement('textarea')` with `classList.add`/`setAttribute` is the fallback used elsewhere).

> Note: `createEl` is Obsidian's augmented `Document`/`Element` method. `buildTabDOM` receives `contentEl`, so use `contentEl.ownerDocument.createElement('textarea')` then set `className = 'specorator-input'` and the three attributes — this avoids relying on a global `createEl` and keeps the node detached (not appended to any parent).

Concretely, replace the `inputEl` creation with:

```ts
  const inputEl = contentEl.ownerDocument.createElement('textarea');
  inputEl.className = 'specorator-input';
  inputEl.setAttribute('placeholder', 'How can i help you today?');
  inputEl.setAttribute('rows', '3');
  inputEl.setAttribute('dir', 'auto');
```

In `createTab`, add the two new UI-independent fields to the returned `tab` object (after `mountedTranscript: null,`):

```ts
    composer: null,
    mountedComposer: null,
```

Leave `state.queueIndicatorEl = dom.queueIndicatorEl;` as-is — it points at the placeholder and is overwritten by `registerQueueRow` on mount.

- [ ] **Step 3: Write `mountTabComposer`**

`src/features/chat/tabs/tabComposerMount.ts`:

```ts
import type { Component } from 'obsidian';

import type SpecoratorPlugin from '../../../main';
import type { ComposerCallbacks } from '../ui/vue/composer/composerCallbacks';
import { mountComposer } from '../ui/vue/composer/mountComposer';
import { TabComposerProjection } from './tabComposer';
import type { TabData } from './types';

/**
 * Mounts the Vue composer island for one tab and wires the engine↔island seam.
 * Called by `TabManager` BETWEEN `createTab` and `initializeTabUI`, so the
 * element handles (container/navRow/wrapper/contextRow/queueRow/edited-files/
 * toolbar-host/textarea-host) are registered to `tab.dom.*` before
 * `initializeTabUI` builds the imperative toolbar + context managers into them.
 *
 * Mirrors `initializeTabControllers`' transcript mount. The projection reads the
 * tab lazily at emit time, so it is safe to construct before the controllers.
 */
export function mountTabComposer(
  tab: TabData,
  plugin: SpecoratorPlugin,
  component: Component,
): void {
  tab.composer = new TabComposerProjection(tab, plugin);

  const callbacks: ComposerCallbacks = {
    subscribe: tab.composer.subscribe,
    registerInputContainer: (el) => { tab.dom.inputContainerEl = el; },
    registerNavRow: (el) => { tab.dom.navRowEl = el; },
    registerInputWrapper: (el) => { tab.dom.inputWrapper = el; },
    registerContextRow: (el) => { tab.dom.contextRowEl = el; },
    registerQueueRow: (el) => {
      tab.dom.queueIndicatorEl = el;
      tab.state.queueIndicatorEl = el;
    },
    registerEditedFilesRow: (el) => { tab.dom.editedFilesRowEl = el; },
    registerToolbarHost: (el) => { tab.dom.toolbarHostEl = el; },
    // Phase 1–3: host the engine-created textarea. Phase 4 deletes this and
    // ComposerTextarea.vue registers INPUT_EL_KEY instead.
    registerTextareaHost: (el) => { el.appendChild(tab.dom.inputEl); },
  };

  tab.mountedComposer = mountComposer(tab.dom.composerHostEl, plugin, component, callbacks);
}
```

- [ ] **Step 4: Point the imperative toolbar at the Vue host**

In `src/features/chat/tabs/tabUi.ts`, in `initializeInputToolbar`, replace:

```ts
  const inputToolbar = dom.inputWrapper.createDiv({ cls: 'specorator-input-toolbar' });
```

with:

```ts
  // The Vue composer island renders `.specorator-input-toolbar`; build the
  // imperative widgets into it (Phase 2 replaces them with Vue components).
  const inputToolbar = dom.toolbarHostEl;
```

- [ ] **Step 5: Wire `mountTabComposer` into TabManager**

In `src/features/chat/tabs/TabManager.ts`, add the import:

```ts
import { mountTabComposer } from './tabComposerMount';
```

and insert the mount call between `createTab(...)` and `initializeTabUI(...)` (right after the `const tab = createTab({...})` block closes, before `// Initialize UI components with provider catalog`):

```ts
      // Mount the Vue composer island so its element handles are registered to
      // tab.dom.* BEFORE initializeTabUI builds the toolbar + context managers
      // into them. `this.view` is the tab component (mirrors the transcript mount).
      mountTabComposer(tab, this.plugin, this.view);
```

Also add composer teardown next to the transcript teardown. Find where `tab.mountedTranscript?.unmount()` runs in `destroyTab` (`src/features/chat/tabs/tabLifecycle.ts`) and add alongside it:

```ts
  tab.mountedComposer?.unmount();
```

(Search `mountedTranscript` in `tabLifecycle.ts` to locate the exact teardown site; add the composer unmount in the same block, before the DOM `contentEl.remove()`.)

- [ ] **Step 5b: Give Vue sole ownership of the three wrapper-mode classes**

`ComposerWrapper.vue` binds `.specorator-input-plan-mode` / `.specorator-input-instruction-mode` / `.specorator-input-bang-bash-mode` from `store.wrapperMode`, and `buildWrapperMode()` (Task 2) projects all three. The engine currently ALSO toggles these classes imperatively on the wrapper — which Vue now owns, so a re-patch would drop them. Convert every imperative wrapper-class toggle to a re-projection. **The textarea placeholder stays engine-owned** — `TriggerInputMode` keeps setting `inputEl.placeholder` directly on the engine-driven textarea; only the class toggles move. Sites (verify by grep of the three class strings across `src/features/chat`):

- **Plan mode:** `src/features/chat/tabs/tabShared.ts` — `refreshTabProviderUI` (~L228) + `updatePlanModeUI` (~L336); `src/features/chat/tabs/tabUi.ts` — `onPermissionModeChange` (~L409, inside the toolbar callbacks); `src/features/chat/SpecoratorView.ts` (~L197, provider refresh). Remove each `dom.inputWrapper.toggleClass('specorator-input-plan-mode', ...)`; add `tab.composer?.emit();` at the end.
- **Instruction / bang-bash:** `src/features/chat/ui/triggerInputMode.ts` (`TriggerInputMode.enter`/`exit`, the base class of `InstructionModeManager`/`BangBashModeManager`) toggles `.specorator-input-instruction-mode` / `.specorator-input-bang-bash-mode` on `getInputWrapper()`. Remove those `classList`/`toggleClass` calls; **keep** the `inputEl.placeholder` writes. Add an injected `onModeChanged?: () => void` to `TriggerInputMode` (wired in `tabUi.ts` when constructing each manager to `() => tab.composer?.emit()`) and call it at the end of `enter()` and `exit()` so the projection re-reads `isActive()` and re-paints the class.

Grep to confirm ZERO string WRITES of `specorator-input-plan-mode` / `specorator-input-instruction-mode` / `specorator-input-bang-bash-mode` remain in imperative code — only `ComposerWrapper.vue`'s `:class` binding references them. This is the "imperative DOM write → reactive data mutation" the design mandates.

- [ ] **Step 6: Write the integration test**

`tests/vue/chat/composer/tabComposerMount.test.ts`:

```ts
import '@/providers';

import { flushPromises } from '@vue/test-utils';
import { App, Component } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mountTabComposer } from '@/features/chat/tabs/tabComposerMount';
import type { TabData } from '@/features/chat/tabs/types';
import type SpecoratorPlugin from '@/main';

// The projection derives wrapperMode.planMode from these; stub so the mount needs
// no real provider wiring.
vi.mock('@/features/chat/tabs/tabShared', () => ({
  getTabPermissionMode: () => 'normal',
  getTabCapabilities: () => ({ supportsPlanMode: true }),
}));

function makeTab(): TabData {
  const doc = document;
  const contentEl = doc.createElement('div');
  doc.body.appendChild(contentEl);
  const composerHostEl = contentEl.appendChild(doc.createElement('div'));
  const inputEl = doc.createElement('textarea');
  inputEl.className = 'specorator-input';
  return {
    dom: {
      contentEl, composerHostEl,
      inputContainerEl: composerHostEl, queueIndicatorEl: composerHostEl,
      inputWrapper: composerHostEl, inputEl, navRowEl: composerHostEl,
      editedFilesRowEl: composerHostEl, contextRowEl: composerHostEl,
      toolbarHostEl: composerHostEl,
    },
    state: { isStreaming: false, queueIndicatorEl: null },
    ui: { instructionModeManager: null, bangBashModeManager: null },
    controllers: { inputController: null },
    composer: null,
    mountedComposer: null,
  } as unknown as TabData;
}

function makePlugin(): SpecoratorPlugin {
  return { app: new App(), settings: {} } as unknown as SpecoratorPlugin;
}

describe('mountTabComposer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('registers every element handle to tab.dom.* and hosts the engine textarea', async () => {
    const tab = makeTab();
    mountTabComposer(tab, makePlugin(), new Component());
    await flushPromises();

    const container = tab.dom.composerHostEl.querySelector('.specorator-input-container') as HTMLElement;
    expect(tab.dom.inputContainerEl).toBe(container);
    expect(tab.dom.navRowEl).toBe(container.querySelector('.specorator-input-nav-row'));
    expect(tab.dom.inputWrapper).toBe(container.querySelector('.specorator-input-wrapper'));
    expect(tab.dom.contextRowEl).toBe(container.querySelector('.specorator-context-row'));
    expect(tab.dom.toolbarHostEl).toBe(container.querySelector('.specorator-input-toolbar'));

    // Queue row registered to BOTH tab.dom and ChatState.
    const queueRow = container.querySelector('.specorator-input-queue-row');
    expect(tab.dom.queueIndicatorEl).toBe(queueRow);
    expect(tab.state.queueIndicatorEl).toBe(queueRow);

    // The engine textarea is hosted inside the Vue textarea host.
    const host = container.querySelector('.specorator-vue-composer-textarea-host') as HTMLElement;
    expect(host.querySelector('textarea.specorator-input')).toBe(tab.dom.inputEl);

    tab.mountedComposer!.unmount();
  });

  it('constructs the per-tab projection and mounts the island', async () => {
    const tab = makeTab();
    mountTabComposer(tab, makePlugin(), new Component());
    await flushPromises();
    expect(tab.composer).not.toBeNull();
    expect(tab.mountedComposer).not.toBeNull();
    tab.mountedComposer!.unmount();
  });
});
```

- [ ] **Step 7: Run the full green bar**

Run: `npm run test:vue -- composer`
Expected: PASS (composerStore, tabComposer, mountComposer, tabComposerMount).
Run: `npm run typecheck && npm run typecheck:vue && npm run test -- --selectProjects unit && npm run build`
Expected: PASS — the imperative composer now renders inside the Vue island; every toolbar widget, chip, indicator, textarea, and the queue row work exactly as before (hosted).

- [ ] **Step 8: Manual/visual verification (parity gate)**

Load the plugin in a vault; open a chat tab. Confirm: the composer renders identically; typing/sending/Mod+Enter works; the toolbar widgets, file/image chips, selection indicators, edited-files bar, and the queued-follow-up row (start a send, queue a follow-up) all behave as before; a blocking approval prompt still hides the composer (`.specorator-hidden` on the Vue container); the tab strip teleports into the nav row in `input` tab-bar mode.

- [ ] **Step 9: Commit**

```bash
git add src/features/chat/tabs/types.ts src/features/chat/tabs/tabFactory.ts \
  src/features/chat/tabs/tabComposerMount.ts src/features/chat/tabs/tabUi.ts \
  src/features/chat/tabs/TabManager.ts src/features/chat/tabs/tabLifecycle.ts \
  tests/vue/chat/composer/tabComposerMount.test.ts
git commit -m "$(cat <<'EOF'
feat(chat): host the imperative composer inside the Vue island (seam only)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014VDsSXWHRqZr2EcNgDX2eq
EOF
)"
```

**Phase 1 complete.** The composer renders through the Vue island; nothing is migrated yet.

# Phase 2 — Toolbar widgets (nine leaf components, no send button)

Each widget reads its projected store slice and fires a `ComposerCallbacks` delegator; provider gating is a projected `visible` flag. The toolbar-host→Vue **cutover is atomic** (Task 10): mixed Vue/imperative children in one host is unsafe, so all nine widget SFCs are built + tested first (Tasks 6–9, not yet live), then Task 10 flips `ComposerToolbar.vue` from host to rendering them and deletes `createInputToolbar`.

### Task 5: Project the toolbar slice + toolbar action delegators (prep, no visual change)

**Files:**
- Modify: `src/features/chat/tabs/tabUi.ts` (extract `buildToolbarActionCallbacks` + `getComposerToolbarSettings`)
- Modify: `src/features/chat/ui/vue/composer/composerCallbacks.ts` (add toolbar delegators)
- Modify: `src/features/chat/tabs/tabComposer.ts` (`buildToolbar` only — `buildWrapperMode`/`buildStreaming` are Phase 1)
- Modify: `src/features/chat/tabs/tabComposerMount.ts` (wire delegators + emit points)
- Modify: `src/features/chat/tabs/tabShared.ts` (`emitComposer` after `refreshTabProviderUI`/`applyProviderUIGating`/`updatePlanModeUI`)
- Test: `tests/vue/chat/composer/toolbarProjection.test.ts`

- [ ] **Step 1: Extract the model-precedence + action callbacks in `tabUi.ts`**

Extract the `getSettings` model-precedence closure from `initializeInputToolbar` into a reusable export:

```ts
export function getComposerToolbarSettings(tab: TabData, plugin: SpecoratorPlugin): ToolbarSettings {
  const snapshot = getTabSettingsSnapshot(tab, plugin);
  if (typeof tab.pinnedModel === 'string' && tab.pinnedModel.trim()) {
    return { ...snapshot, model: tab.pinnedModel.trim() };
  }
  if (tab.lifecycleState === 'blank' && typeof tab.draftModel === 'string' && tab.draftModel.trim()) {
    return { ...snapshot, model: tab.draftModel.trim() };
  }
  if (tab.displayModel && tab.displayModel.conversationId === tab.conversationId && tab.displayModel.model.trim()) {
    return { ...snapshot, model: tab.displayModel.model.trim() };
  }
  return snapshot;
}
```

Extract the `createInputToolbar` callbacks object into `buildToolbarActionCallbacks(tab, plugin, getProviderCatalogConfig?, onProviderChanged?): ToolbarCallbacks` returning the exact same object currently passed to `createInputToolbar` (the `onModelChange`/`onModeChange`/`onThinkingBudgetChange`/`onEffortLevelChange`/`onServiceTierChange`/`onPermissionModeChange`/`onPlanModeToggle`/`getSettings`/`getEnvironmentVariables`/`getUIConfig`/`getCapabilities` closures — move them verbatim, replacing the inline `getSettings` body with `getComposerToolbarSettings(tab, plugin)`). Have `initializeInputToolbar` call `createInputToolbar(inputToolbar, buildToolbarActionCallbacks(tab, plugin, getProviderCatalogConfig, onProviderChanged))`. This is behavior-preserving — verify `npm run test -- --selectProjects unit` stays green.

- [ ] **Step 2: Add the toolbar action delegators to `ComposerCallbacks`**

In `src/features/chat/ui/vue/composer/composerCallbacks.ts`, add to `ComposerCallbacks`:

```ts
  onSetModel: (model: string) => void;
  onSetMode: (mode: string) => void;
  onSetEffortLevel: (effort: string) => void;
  onSetThinkingBudget: (budget: string) => void;
  onSetServiceTier: (serviceTier: string) => void;
  onSetPermission: (mode: string) => void;
  onTogglePlanMode: () => void;
  onToggleMcpServer: (serverName: string) => void;
  onAddExternalContext: () => void;
  onRemoveExternalContext: (path: string) => void;
  onToggleExternalContextPersistence: (path: string) => void;
```

- [ ] **Step 3: Fill `buildToolbar` in the projection**

In `src/features/chat/tabs/tabComposer.ts`, add imports:

```ts
import { getEnabledProviderForModel } from '../../../core/providers/modelRouting';
import { getBlankTabModelOptions } from './tabModelPolicy';
import {
  getComposerToolbarSettings, getTabCapabilities, getTabChatUIConfig,
} from './tabUi'; // getTabCapabilities/getTabChatUIConfig re-exported from tabShared via tabUi imports; import from tabShared if not
```

(Import `getTabCapabilities`, `getTabChatUIConfig`, `getTabPermissionMode` from `./tabShared`; `getComposerToolbarSettings` from `./tabUi`.)

Replace the deferred `buildToolbar()` stub with the real implementation. `snapshot()`, `buildStreaming()`, and `buildWrapperMode()` are ALREADY wired in Phase 1 — do NOT touch them here:

```ts
  private buildToolbar(): ComposerToolbarState {
    const tab = this.tab;
    const plugin = this.plugin;
    const settings = getComposerToolbarSettings(tab, plugin);
    const caps = getTabCapabilities(tab, plugin);
    const uiConfig = getTabChatUIConfig(tab, plugin);

    // Model options (blank tabs mix providers via getBlankTabModelOptions).
    const modelOptions = tab.lifecycleState === 'blank'
      ? getBlankTabModelOptions(plugin.settings)
      : uiConfig.getModelOptions({ ...settings, environmentVariables: plugin.getActiveEnvironmentVariables() });
    const modelGroups = groupModelOptions(modelOptions, uiConfig);
    const modelLabel = modelOptions.find((o) => o.value === settings.model)?.label ?? settings.model;

    // Mode switch (visible only with exactly two options).
    const modeConfig = uiConfig.getModeSelector?.(settings) ?? null;
    const mode = modeConfig && modeConfig.options.length === 2
      ? {
          label: modeConfig.label, value: modeConfig.value, activeValue: modeConfig.activeValue,
          active: settings[modeConfig.value] === modeConfig.activeValue || modeConfig.value === modeConfig.activeValue,
          title: modeConfig.options.map((o) => o.label).join(' ↔ '),
          options: modeConfig.options.map((o) => ({ value: o.value, label: o.label, description: o.description })),
        }
      : null;

    // Reasoning (effort vs budget; hidden when control === 'none' or trivial).
    const reasoning = buildReasoningState(caps, uiConfig, settings);

    // Service tier.
    const tierConfig = uiConfig.getServiceTierToggle?.(settings) ?? null;
    const serviceTier = tierConfig
      ? { active: settings.serviceTier === tierConfig.activeValue, activeValue: tierConfig.activeValue, inactiveValue: tierConfig.inactiveValue }
      : null;

    // Permission toggle.
    const permConfig = uiConfig.getPermissionModeToggle?.() ?? null;
    const permission = permConfig
      ? buildPermissionState(permConfig, settings, caps)
      : null;

    // Plan mode toggle.
    const planValue = permConfig?.planValue;
    const planMode = {
      visible: caps.supportsPlanMode && Boolean(planValue),
      active: Boolean(planValue) && settings.permissionMode === planValue,
    };

    // MCP servers.
    const mcp = buildMcpState(tab, caps);

    // External contexts.
    const externalContext = buildExternalContextState(tab);

    // Context usage meter.
    const usage = tab.state.usage && tab.state.usage.contextTokens > 0
      ? { percentage: tab.state.usage.percentage, warning: tab.state.usage.percentage > 80, tooltip: buildUsageTooltip(tab.state.usage) }
      : null;

    return { modelLabel, modelGroups, mode, reasoning, serviceTier, permission, planMode, mcp, externalContext, usage };
  }
```

Add the module-level helper functions `groupModelOptions`, `buildReasoningState`, `buildPermissionState`, `buildMcpState`, `buildExternalContextState`, `buildUsageTooltip` at the bottom of `tabComposer.ts`. Implement them to mirror the imperative widgets' render logic exactly (see the widget contracts in `src/features/chat/ui/toolbar/*`):

```ts
import type { ProviderCapabilities, ProviderChatUIConfig, ProviderIconSvg } from '../../../core/providers/types';
import type { ComposerModelGroup, ComposerReasoningControl, ComposerReasoningState, ComposerPermissionState, ComposerMcpState, ComposerExternalContextState } from '../ui/vue/composer/stores/composerStore';
import type { ToolbarSettings } from '../ui/toolbar/shared';
import { formatTokens } from '../ui/toolbar/shared';
import { getProviderMcpManager } from './tabShared';
import type { UsageInfo } from '../utils/usageInfo';

function groupModelOptions(
  options: Array<{ value: string; label: string; group?: string; providerIcon?: ProviderIconSvg }>,
  uiConfig: ProviderChatUIConfig,
): ComposerModelGroup[] {
  const groups: ComposerModelGroup[] = [];
  const byGroup = new Map<string | null, ComposerModelGroup>();
  for (const o of options) {
    const key = o.group ?? null;
    let g = byGroup.get(key);
    if (!g) { g = { label: key, options: [] }; byGroup.set(key, g); groups.push(g); }
    g.options.push({ value: o.value, label: o.label, providerIcon: o.providerIcon ?? uiConfig.getProviderIcon?.() });
  }
  return groups;
}

function buildReasoningState(
  caps: ProviderCapabilities, uiConfig: ProviderChatUIConfig, settings: ToolbarSettings,
): ComposerReasoningState | null {
  // Mirrors ThinkingBudgetSelector.render: hide entirely, else show EXACTLY ONE
  // control (effort for adaptive models, budget otherwise) — both fed by the SAME
  // getReasoningOptions. There is NO separate effort-options source.
  if (caps.reasoningControl === 'none') return null;
  const model = settings.model;
  const options = uiConfig.getReasoningOptions?.(model, settings) ?? [];
  if (options.length === 0) return null;
  const def = uiConfig.getDefaultReasoningValue?.(model, settings);
  if (options.length === 1 && options[0].value === def) return null;

  const mapped = options.map((o) => ({ value: o.value, label: o.label, title: o.title }));
  const adaptive = uiConfig.isAdaptiveReasoningModel?.(model, settings) ?? false;

  if (adaptive) {
    // EFFORT gears (persist `effortLevel` via onSetEffortLevel).
    return {
      effort: {
        label: 'Effort:',
        current: options.find((o) => o.value === settings.effortLevel)?.label ?? settings.effortLevel,
        options: mapped,
      },
      budget: null,
    };
  }
  // Thinking-BUDGET gears (persist `thinkingBudget` via onSetThinkingBudget).
  return {
    budget: {
      label: 'Thinking:',
      current: options.find((o) => o.value === settings.thinkingBudget)?.label ?? settings.thinkingBudget,
      options: mapped,
    },
    effort: null,
  };
}

function buildPermissionState(
  permConfig: { activeValue: string; inactiveValue: string; activeLabel: string; inactiveLabel: string; planValue?: string; planLabel?: string },
  settings: ToolbarSettings, caps: ProviderCapabilities,
): ComposerPermissionState {
  const inPlan = Boolean(permConfig.planValue) && settings.permissionMode === permConfig.planValue && caps.supportsPlanMode;
  const active = settings.permissionMode === permConfig.activeValue;
  return {
    visible: true,
    label: inPlan ? (permConfig.planLabel ?? '') : (active ? permConfig.activeLabel : permConfig.inactiveLabel),
    active, planActive: inPlan, switchVisible: !inPlan,
  };
}

function buildMcpState(tab: TabData, caps: ProviderCapabilities): ComposerMcpState {
  if (!caps.supportsMcpTools) return { visible: false, count: 0, servers: [] };
  const manager = getProviderMcpManager(caps.providerId);
  const all = manager?.getServers().filter((s) => s.enabled) ?? [];
  const enabled = tab.ui.mcpServerSelector?.getEnabledServers() ?? new Set<string>();
  return {
    visible: all.length > 0, count: enabled.size,
    servers: all.map((s) => ({ name: s.name, enabled: enabled.has(s.name), contextSaving: Boolean(s.contextSaving) })),
  };
}

function buildExternalContextState(tab: TabData): ComposerExternalContextState {
  const paths = tab.ui.externalContextSelector?.getExternalContexts() ?? [];
  const persistent = new Set(tab.ui.externalContextSelector?.getPersistentPaths() ?? []);
  return {
    count: paths.length,
    items: paths.map((p) => ({ path: p, persistent: persistent.has(p) })),
  };
}

function buildUsageTooltip(usage: UsageInfo): string {
  let tip = `${formatTokens(usage.contextTokens)} / ${formatTokens(usage.contextWindow)}`;
  if (usage.costUsd) tip += ` · $${usage.costUsd.toFixed(4)}`;
  if (usage.percentage > 80) tip += ' (Approaching limit, run `/compact` to continue)';
  return tip;
}
```

> If a `uiConfig` method name here differs from the real signature, use the exact name from `src/core/providers/types.ts` `ProviderChatUIConfig` — the projection must call the SAME methods the imperative widgets call (verify against `ui/toolbar/ModelSelector.ts` etc.). Keep the model-option `group` field mapping consistent with `getModelOptions`' real return shape. **Reasoning specifically:** the imperative `ThinkingBudgetSelector.render` shows EXACTLY ONE control, both fed by `getReasoningOptions` — there is NO `getEffortOptions`. `isAdaptiveReasoningModel` selects which: adaptive → effort control (persists `effortLevel`), non-adaptive → budget control (persists `thinkingBudget`).

- [ ] **Step 4: Wire the toolbar delegators + emit points in `tabComposerMount.ts`**

Add to the `callbacks` object in `mountTabComposer` (build the action callbacks once):

```ts
  const toolbarActions = buildToolbarActionCallbacks(tab, plugin);
```

and the delegators:

```ts
    onSetModel: (model) => { void toolbarActions.onModelChange(model).finally(() => tab.composer?.emit()); },
    onSetMode: (mode) => { void toolbarActions.onModeChange(mode).finally(() => tab.composer?.emit()); },
    onSetEffortLevel: (effort) => { void toolbarActions.onEffortLevelChange(effort).finally(() => tab.composer?.emit()); },
    onSetThinkingBudget: (budget) => { void toolbarActions.onThinkingBudgetChange(budget).finally(() => tab.composer?.emit()); },
    onSetServiceTier: (tier) => { void toolbarActions.onServiceTierChange(tier).finally(() => tab.composer?.emit()); },
    onSetPermission: (mode) => { void toolbarActions.onPermissionModeChange(mode).finally(() => tab.composer?.emit()); },
    onTogglePlanMode: () => { void toolbarActions.onPlanModeToggle?.().finally(() => tab.composer?.emit()); },
    onToggleMcpServer: (name) => {
      const enabled = tab.ui.mcpServerSelector?.getEnabledServers() ?? new Set<string>();
      const next = new Set(enabled);
      if (next.has(name)) next.delete(name); else next.add(name);
      tab.ui.mcpServerSelector?.setEnabledServers([...next]);
      tab.composer?.emit();
    },
    // External-context re-projection is driven by ExternalContextSelector's
    // `onChange` (Step 5), NOT synchronously here: `openFolderPicker()` is ASYNC
    // (`await remote.dialog.showOpenDialog`) and appends + fires onChange only
    // AFTER the dialog resolves; remove + persistence also route through onChange.
    // A synchronous `tab.composer?.emit()` here would project the OLD list.
    onAddExternalContext: () => { void tab.ui.externalContextSelector?.openFolderPicker(); },
    onRemoveExternalContext: (path) => { tab.ui.externalContextSelector?.removePath(path); },
    onToggleExternalContextPersistence: (path) => { tab.ui.externalContextSelector?.togglePersistence(path); },
```

Import `buildToolbarActionCallbacks` from `./tabUi`. `ExternalContextSelector.openFolderPicker()` is the existing ASYNC picker entry point (`await remote.dialog.showOpenDialog`); the Vue path fires it and the widget's `onChange` (wired in Step 5) drives the re-projection once it resolves. If the picker is not already a public method, expose it as `openFolderPicker(): Promise<void>` (single source of the picker logic).

- [ ] **Step 5: Emit on every imperative toolbar repaint**

In `src/features/chat/tabs/tabShared.ts`, at the END of `refreshTabProviderUI`, `applyProviderUIGating`, and `updatePlanModeUI`, add:

```ts
  tab.composer?.emit();
```

Also add `tab.composer?.emit();` to the `onUsageChanged` callback in `tabUi.ts` (`initializeTabUI`'s `state.callbacks.onUsageChanged`, after `tab.ui.contextUsageMeter?.update(usage)`). This keeps the projected toolbar slice live for the (still-imperative in Phase 2) widgets — a no-op for rendering until the cutover, but it makes the store correct and the projection testable now.

**External-context list is re-projected from the selector's `onChange` (async-safe).** In `tabUi.ts`'s `initializeInputToolbar`, the existing `tab.ui.externalContextSelector.setOnChange(() => { tab.ui.fileContextManager?.preScanExternalContexts(); })` fires AFTER `openFolderPicker()` resolves and on every remove/persistence change — add `tab.composer?.emit();` inside it so the projected `toolbar.externalContext` list updates when the real change lands, never before. (Also add `tab.composer?.emit();` to the `setOnPersistenceChange` handler so the lock state re-projects on a persistence toggle.) This is the ONLY driver for the external-context slice — the Vue delegators (Step 4) never emit synchronously.

**Wrapper-mode classes stay store-owned.** Phase 1 Task 5b already removed every imperative wrapper-class toggle and gave Vue's `:class` binding sole ownership (projected by `buildWrapperMode`). When you move the `onPermissionModeChange` handler into `buildToolbarActionCallbacks` (Step 1), confirm it does NOT re-introduce a `dom.inputWrapper.toggleClass('specorator-input-plan-mode', ...)` line — it must only mutate settings + `tab.composer?.emit()`. Re-grep the three `specorator-input-*-mode` class strings to confirm zero imperative writes remain.

- [ ] **Step 6: Write the projection test**

`tests/vue/chat/composer/toolbarProjection.test.ts` — construct a `TabComposerProjection` over a stub `tab` whose `getComposerToolbarSettings`/capabilities/uiConfig produce a known model list, mode config, reasoning options, permission toggle, and usage; assert `snapshot.toolbar.modelLabel`, `.mode` (null when options ≠ 2), `.reasoning` (EXACTLY ONE of `.budget`/`.effort` non-null: `.effort` non-null + `.budget` null for an adaptive-model stub, `.budget` non-null + `.effort` null for a non-adaptive stub; `null` when options are empty/lone-default), `.permission.planActive`, `.planMode.visible`, `.mcp.visible`, `.usage.warning`. (Follow the `tabComposer.test.ts` stub pattern; mock the `tabShared`/`tabUi` helpers via `vi.mock` to return deterministic config.)

**Async external-context timing test:** subscribe an observer to the projection; give the stub `externalContextSelector` a fake `openFolderPicker()` that appends a path to its list and fires its `onChange` on a resolved microtask (not synchronously); wire that `onChange` to `projection.emit()` (mirroring the Step 5 wiring). Assert that invoking `onAddExternalContext` does NOT include the new path in the snapshot emitted synchronously, and that AFTER the picker's promise resolves the next emitted snapshot's `toolbar.externalContext.items` DOES include it (same channel covers remove + persistence toggle — flip `persistent` via a fake `togglePersistence` firing `onChange`).

- [ ] **Step 7: Run + commit**

Run: `npm run test:vue -- toolbarProjection && npm run test -- --selectProjects unit`
Expected: PASS (imperative toolbar unchanged; projection now produces the slice).

```bash
git add src/features/chat/tabs/tabUi.ts src/features/chat/ui/vue/composer/composerCallbacks.ts \
  src/features/chat/tabs/tabComposer.ts src/features/chat/tabs/tabComposerMount.ts \
  src/features/chat/tabs/tabShared.ts src/features/chat/ui/toolbar/ExternalContextSelector.ts \
  tests/vue/chat/composer/toolbarProjection.test.ts
git commit -m "$(cat <<'EOF'
feat(chat): project the composer toolbar slice + action delegators

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014VDsSXWHRqZr2EcNgDX2eq
EOF
)"
```

### Task 6: `ModelSelector.vue` + `ModeSelector.vue`

**Files:** Create `.../composer/components/toolbar/ModelSelector.vue`, `ModeSelector.vue`; Test `tests/vue/chat/composer/toolbar/modelSelector.test.ts`, `modeSelector.test.ts`.

Each widget reads `useComposerStore().toolbar.<slice>` and injects `CALLBACKS_KEY`. Dropdown open/close is local state; match the existing `src/style/toolbar/*` visibility mechanism (these use `v-if` for the panel — verify the CSS does not require a `.visible` class; if it does, add `:class="{ visible: open }"`).

- [ ] **Step 1: `ModelSelector.vue`**

```vue
<script setup lang="ts">
import { inject, ref } from 'vue';
import { CALLBACKS_KEY } from '../../composerKeys';
import { useComposerStore } from '../../stores/composerStore';
// Verify relative depth reaches src/shared/icons and src/core/providers/types.
import { createProviderIconSvg } from '../../../../../../../shared/icons';
import type { ProviderIconSvg } from '../../../../../../../core/providers/types';

const store = useComposerStore();
const cb = inject(CALLBACKS_KEY);
const open = ref(false);
function pick(value: string): void {
  open.value = false;
  cb?.onSetModel(value);
}
// providerIcon is a ProviderIconSvg DESCRIPTOR (not a string). Render it as a REAL
// SVG element built by createProviderIconSvg (the same helper the imperative
// ModelSelector used) — NO v-html / innerHTML (repo no-innerHTML rule). A function
// ref appends the SVG node into the host span on mount/patch.
function renderProviderIcon(el: HTMLElement | null, icon: ProviderIconSvg | undefined): void {
  if (!el) return;
  el.replaceChildren();
  if (icon) el.appendChild(createProviderIconSvg(icon, { size: 14 }));
}
</script>

<template>
  <div class="specorator-model-selector">
    <button class="specorator-model-btn" type="button" @click="open = !open">
      <span class="specorator-model-label">{{ store.toolbar.modelLabel }}</span>
    </button>
    <div v-if="open" class="specorator-model-dropdown">
      <template v-for="(group, gi) in store.toolbar.modelGroups" :key="gi">
        <div v-if="group.label" class="specorator-model-group">{{ group.label }}</div>
        <div
          v-for="opt in group.options"
          :key="opt.value"
          class="specorator-model-option"
          :class="{ selected: opt.value === store.toolbar.modelLabel || opt.label === store.toolbar.modelLabel }"
          @click="pick(opt.value)"
        >
          <span
            v-if="opt.providerIcon"
            class="specorator-model-provider-icon"
            :ref="(el) => renderProviderIcon(el as HTMLElement, opt.providerIcon)"
          />
          <span>{{ opt.label }}</span>
        </div>
      </template>
    </div>
  </div>
</template>
```

> **No `v-html`.** `opt.providerIcon` is a `ProviderIconSvg` descriptor object, not a string — `createProviderIconSvg(icon, {...})` returns a real `<svg>` node (verify the exact option shape, e.g. `{ size }`, against `src/shared/icons`). Building the DOM node and appending it satisfies the repo's no-`innerHTML`/no-`v-html` rule; the function ref re-renders when the option's icon changes.

- [ ] **Step 2: `ModeSelector.vue`**

```vue
<script setup lang="ts">
import { inject } from 'vue';
import { CALLBACKS_KEY } from '../../composerKeys';
import { useComposerStore } from '../../stores/composerStore';

const store = useComposerStore();
const cb = inject(CALLBACKS_KEY);
function toggle(): void {
  const mode = store.toolbar.mode;
  if (!mode) return;
  const next = mode.active ? mode.options.find((o) => o.value !== mode.activeValue)?.value : mode.activeValue;
  if (next) cb?.onSetMode(next);
}
</script>

<template>
  <div v-if="store.toolbar.mode" class="specorator-mode-selector" :title="store.toolbar.mode.title" @click="toggle">
    <span class="specorator-mode-label" :class="{ active: store.toolbar.mode.active }">{{ store.toolbar.mode.label }}</span>
    <div class="specorator-toggle-switch" :class="{ active: store.toolbar.mode.active }" />
  </div>
</template>
```

- [ ] **Step 3: Tests** — mount each with a stubbed store slice; assert (a) it renders the contract root class, (b) picking/toggling fires the right callback with the right value, (c) `ModeSelector` renders nothing when `store.toolbar.mode === null`, (d) for `ModelSelector` given an option whose `providerIcon` is a `ProviderIconSvg` descriptor stub, opening the dropdown renders a REAL `.specorator-model-provider-icon svg` element (query `svg` under the icon span) — NOT the literal text `[object Object]` and no `innerHTML` string. Use `createComposerPinia()` + `setActivePinia` + `provide(CALLBACKS_KEY, stub)` via `@vue/test-utils` `mount(..., { global: { provide, plugins: [pinia] } })`.

- [ ] **Step 4: Run + commit** (`npm run test:vue -- modelSelector modeSelector`).

```bash
git add src/features/chat/ui/vue/composer/components/toolbar/ModelSelector.vue \
  src/features/chat/ui/vue/composer/components/toolbar/ModeSelector.vue \
  tests/vue/chat/composer/toolbar/modelSelector.test.ts tests/vue/chat/composer/toolbar/modeSelector.test.ts
git commit -m "$(cat <<'EOF'
feat(chat): add composer ModelSelector + ModeSelector Vue widgets

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014VDsSXWHRqZr2EcNgDX2eq
EOF
)"
```

### Task 7: `ThinkingBudgetSelector.vue` + `ServiceTierToggle.vue`

**Files:** Create `.../toolbar/ThinkingBudgetSelector.vue`, `ServiceTierToggle.vue`; Test the two.

- [ ] **Step 1: `ThinkingBudgetSelector.vue`**

```vue
<script setup lang="ts">
import { computed, inject } from 'vue';
import { CALLBACKS_KEY } from '../../composerKeys';
import { useComposerStore } from '../../stores/composerStore';

const store = useComposerStore();
const cb = inject(CALLBACKS_KEY);
const reasoning = computed(() => store.toolbar.reasoning);
</script>

<template>
  <!-- The projection provides EXACTLY ONE of budget/effort (never both, per
       ThinkingBudgetSelector.render): adaptive models → effort gears (persist
       effortLevel via onSetEffortLevel), non-adaptive → budget gears (persist
       thinkingBudget via onSetThinkingBudget). Render whichever is non-null. -->
  <div v-if="reasoning && (reasoning.budget || reasoning.effort)" class="specorator-thinking-selector">
    <div v-if="reasoning.budget" class="specorator-thinking-budget">
      <span class="specorator-thinking-label-text">{{ reasoning.budget.label }}</span>
      <div class="specorator-thinking-gears">
        <span class="specorator-thinking-current">{{ reasoning.budget.current }}</span>
        <div class="specorator-thinking-options">
          <div
            v-for="opt in reasoning.budget.options"
            :key="opt.value"
            class="specorator-thinking-gear"
            :class="{ selected: opt.label === reasoning.budget.current }"
            :title="opt.title"
            @click="cb?.onSetThinkingBudget(opt.value)"
          >{{ opt.label }}</div>
        </div>
      </div>
    </div>
    <div v-if="reasoning.effort" class="specorator-thinking-effort">
      <span class="specorator-thinking-label-text">{{ reasoning.effort.label }}</span>
      <div class="specorator-thinking-gears">
        <span class="specorator-thinking-current">{{ reasoning.effort.current }}</span>
        <div class="specorator-thinking-options">
          <div
            v-for="opt in reasoning.effort.options"
            :key="opt.value"
            class="specorator-thinking-gear"
            :class="{ selected: opt.label === reasoning.effort.current }"
            :title="opt.title"
            @click="cb?.onSetEffortLevel(opt.value)"
          >{{ opt.label }}</div>
        </div>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: `ServiceTierToggle.vue`**

```vue
<script setup lang="ts">
import { inject, onMounted, ref } from 'vue';
import { setIcon } from 'obsidian';
import { CALLBACKS_KEY } from '../../composerKeys';
import { useComposerStore } from '../../stores/composerStore';

const store = useComposerStore();
const cb = inject(CALLBACKS_KEY);
const iconEl = ref<HTMLElement | null>(null);
onMounted(() => { if (iconEl.value) setIcon(iconEl.value, 'zap'); });
function toggle(): void {
  const t = store.toolbar.serviceTier;
  if (!t) return;
  cb?.onSetServiceTier(t.active ? t.inactiveValue : t.activeValue);
}
</script>

<template>
  <div v-if="store.toolbar.serviceTier" class="specorator-service-tier-toggle">
    <div class="specorator-service-tier-button" :class="{ active: store.toolbar.serviceTier.active }" title="Toggle on/off fast mode" @click="toggle">
      <span ref="iconEl" class="specorator-service-tier-icon" />
    </div>
  </div>
</template>
```

- [ ] **Step 3–4: Tests + commit** — assert: `reasoning: null` renders nothing; a non-adaptive projection (`budget` set, `effort: null`) renders ONLY `.specorator-thinking-budget` (no `.specorator-thinking-effort`) and a gear click fires `onSetThinkingBudget(value)`; an adaptive projection (`effort` set, `budget: null`) renders ONLY `.specorator-thinking-effort` (no `.specorator-thinking-budget`) and a gear click fires `onSetEffortLevel(value)` (the inert-effort regression guard). Exactly one control renders, never both. `ServiceTierToggle` gating + toggle callback as before.

```bash
git add src/features/chat/ui/vue/composer/components/toolbar/ThinkingBudgetSelector.vue \
  src/features/chat/ui/vue/composer/components/toolbar/ServiceTierToggle.vue \
  tests/vue/chat/composer/toolbar/thinkingBudgetSelector.test.ts tests/vue/chat/composer/toolbar/serviceTierToggle.test.ts
git commit -m "$(cat <<'EOF'
feat(chat): add composer ThinkingBudgetSelector + ServiceTierToggle Vue widgets

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014VDsSXWHRqZr2EcNgDX2eq
EOF
)"
```

### Task 8: `PermissionToggle.vue` + `PlanModeToggle.vue`

**Files:** Create `.../toolbar/PermissionToggle.vue`, `PlanModeToggle.vue`; Test the two.

- [ ] **Step 1: `PermissionToggle.vue`**

```vue
<script setup lang="ts">
import { inject } from 'vue';
import { CALLBACKS_KEY } from '../../composerKeys';
import { useComposerStore } from '../../stores/composerStore';

const store = useComposerStore();
const cb = inject(CALLBACKS_KEY);
// The imperative toggle cycled activeValue↔inactiveValue; the projection carries
// `active`, so fire the opposite value. The concrete values live in the provider
// config; the projection is extended to carry them if the toggle needs them —
// here we delegate the cycle to onSetPermission, which the engine action resolves
// against the current permission config (buildToolbarActionCallbacks owns the map).
function toggle(): void {
  const p = store.toolbar.permission;
  if (!p || !p.switchVisible) return;
  cb?.onSetPermission(p.active ? 'inactive' : 'active');
}
</script>

<template>
  <div v-if="store.toolbar.permission && store.toolbar.permission.visible" class="specorator-permission-toggle">
    <span class="specorator-permission-label" :class="{ 'plan-active': store.toolbar.permission.planActive }">{{ store.toolbar.permission.label }}</span>
    <div
      v-show="store.toolbar.permission.switchVisible"
      class="specorator-toggle-switch"
      :class="{ active: store.toolbar.permission.active }"
      @click="toggle"
    />
  </div>
</template>
```

> **Verify the permission-cycle mapping.** The imperative `PermissionToggle` computed `newMode` from `activeValue`/`inactiveValue` in the provider `getPermissionModeToggle()` config, not the literals `'active'`/`'inactive'`. Extend `ComposerPermissionState` with `activeValue: string; inactiveValue: string;` (projected from `permConfig`) and fire `cb?.onSetPermission(p.active ? p.inactiveValue : p.activeValue)`. Add those two fields in Task 5's `buildPermissionState` and this template — keep the name `ComposerPermissionState` consistent.

- [ ] **Step 2: `PlanModeToggle.vue`**

```vue
<script setup lang="ts">
import { inject, onMounted, ref } from 'vue';
import { setIcon } from 'obsidian';
import { CALLBACKS_KEY } from '../../composerKeys';
import { useComposerStore } from '../../stores/composerStore';
import { t } from '../../../../../../i18n/i18n';

const store = useComposerStore();
const cb = inject(CALLBACKS_KEY);
const iconEl = ref<HTMLElement | null>(null);
onMounted(() => { if (iconEl.value) setIcon(iconEl.value, 'map'); });
</script>

<template>
  <div v-if="store.toolbar.planMode.visible" class="specorator-plan-mode-toggle">
    <div
      class="specorator-plan-mode-button"
      :class="{ active: store.toolbar.planMode.active }"
      :aria-pressed="store.toolbar.planMode.active"
      :aria-label="t('chat.planMode.toggle')"
      :title="t('chat.planMode.toggle')"
      @click="cb?.onTogglePlanMode()"
    >
      <span ref="iconEl" class="specorator-plan-mode-icon" />
    </div>
  </div>
</template>
```

> Use the exact `t('chat.planMode.*')` keys the imperative `PlanModeToggle` used for `aria-label`/`title` (read them from `ui/toolbar/PlanModeToggle.ts`).

- [ ] **Step 3–4: Tests + commit.**

```bash
git add src/features/chat/ui/vue/composer/components/toolbar/PermissionToggle.vue \
  src/features/chat/ui/vue/composer/components/toolbar/PlanModeToggle.vue \
  src/features/chat/ui/vue/composer/composerCallbacks.ts src/features/chat/tabs/tabComposer.ts \
  tests/vue/chat/composer/toolbar/permissionToggle.test.ts tests/vue/chat/composer/toolbar/planModeToggle.test.ts
git commit -m "$(cat <<'EOF'
feat(chat): add composer PermissionToggle + PlanModeToggle Vue widgets

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014VDsSXWHRqZr2EcNgDX2eq
EOF
)"
```

### Task 9: `McpServerSelector.vue` + `ExternalContextSelector.vue` + `ContextUsageMeter.vue`

**Files:** Create the three SFCs under `.../toolbar/`; Test each. (No `SendButton.vue` — send is keyboard-only, strict parity.)

- [ ] **Step 1: `McpServerSelector.vue`**

```vue
<script setup lang="ts">
import { inject, ref } from 'vue';
import { CALLBACKS_KEY } from '../../composerKeys';
import { useComposerStore } from '../../stores/composerStore';

const store = useComposerStore();
const cb = inject(CALLBACKS_KEY);
const open = ref(false);
</script>

<template>
  <div v-if="store.toolbar.mcp.visible" class="specorator-mcp-selector">
    <div class="specorator-mcp-selector-icon-wrapper" @click="open = !open">
      <span class="specorator-mcp-selector-icon" />
      <span class="specorator-mcp-selector-badge" :class="{ visible: store.toolbar.mcp.count > 1 }">{{ store.toolbar.mcp.count > 1 ? store.toolbar.mcp.count : '' }}</span>
    </div>
    <div v-if="open" class="specorator-mcp-selector-dropdown">
      <div class="specorator-mcp-selector-header">Mcp servers</div>
      <div class="specorator-mcp-selector-list">
        <div v-if="store.toolbar.mcp.servers.length === 0" class="specorator-mcp-selector-empty">None</div>
        <div
          v-for="s in store.toolbar.mcp.servers"
          :key="s.name"
          class="specorator-mcp-selector-item"
          :class="{ enabled: s.enabled }"
          @click="cb?.onToggleMcpServer(s.name)"
        >
          <span class="specorator-mcp-selector-check" />
          <div class="specorator-mcp-selector-item-info">
            <span class="specorator-mcp-selector-item-name">{{ s.name }}</span>
            <span v-if="s.contextSaving" class="specorator-mcp-selector-cs-badge">@</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
```

> The icon/check glyphs used `appendMcpIcon`/`appendCheckIcon` (imperative SVG helpers). Populate `.specorator-mcp-selector-icon` / `.specorator-mcp-selector-check` via those same helpers in `onMounted` (reuse them — do not re-draw). Badge shows the number only past 1, matching `updateCountBadgeDisplay`.

- [ ] **Step 2: `ExternalContextSelector.vue`**

```vue
<script setup lang="ts">
import { inject, onMounted, ref } from 'vue';
import { setIcon } from 'obsidian';
import { CALLBACKS_KEY } from '../../composerKeys';
import { useComposerStore } from '../../stores/composerStore';

const store = useComposerStore();
const cb = inject(CALLBACKS_KEY);
const iconEl = ref<HTMLElement | null>(null);
onMounted(() => { if (iconEl.value) setIcon(iconEl.value, 'folder'); });
</script>

<template>
  <div class="specorator-external-context-selector">
    <!-- The VISIBLE folder icon is the single hit target: click opens the native
         picker via onAddExternalContext (which calls openFolderPicker). -->
    <div class="specorator-external-context-icon-wrapper" @click="cb?.onAddExternalContext()">
      <span ref="iconEl" class="specorator-external-context-icon" />
      <span class="specorator-external-context-badge" :class="{ visible: store.toolbar.externalContext.count > 1 }">{{ store.toolbar.externalContext.count > 1 ? store.toolbar.externalContext.count : '' }}</span>
    </div>
    <!-- ALWAYS in the DOM; revealed by the existing
         `.specorator-external-context-selector:hover .specorator-external-context-dropdown`
         CSS. NO `open` flag, NO second (empty) wrapper. -->
    <div class="specorator-external-context-dropdown">
      <div class="specorator-external-context-header">External contexts</div>
      <div class="specorator-external-context-list">
        <div v-if="store.toolbar.externalContext.items.length === 0" class="specorator-external-context-empty">Click the folder icon to add</div>
        <div v-for="item in store.toolbar.externalContext.items" :key="item.path" class="specorator-external-context-item">
          <span class="specorator-external-context-text" :title="item.path">{{ item.path }}</span>
          <span class="specorator-external-context-lock" :class="{ locked: item.persistent }" :title="item.persistent ? 'Persistent (saved)' : 'Session only'" @click="cb?.onToggleExternalContextPersistence(item.path)" />
          <span class="specorator-external-context-remove" title="Remove" @click="cb?.onRemoveExternalContext(item.path)" />
        </div>
      </div>
    </div>
  </div>
</template>
```

> Populate the lock/unlock/x glyphs with `setIcon(..., item.persistent ? 'lock' : 'unlock')` / `setIcon(..., 'x')` in a small child or `onMounted` ref loop, matching the imperative widget. Mirror the imperative DOM exactly (`ExternalContextSelector.ts:207-222`): one `.specorator-external-context-icon-wrapper` (visible folder icon + badge, click → picker) and the `.specorator-external-context-dropdown` ALWAYS present, hover-revealed by the existing CSS. Do NOT invent an `open` flag or an empty second wrapper — keep the exact `.specorator-external-context-*` classes so the stylesheet applies unchanged.

- [ ] **Step 3: `ContextUsageMeter.vue`** (read-only projection)

```vue
<script setup lang="ts">
import { useComposerStore } from '../../stores/composerStore';
const store = useComposerStore();
// 240° gauge (150°→390°); mirror ContextUsageMeter.update's arc math.
const RADIUS = 16;
const ARC_RADIANS = (240 * Math.PI) / 180;
const CIRCUMFERENCE = RADIUS * ARC_RADIANS;
function dashOffset(pct: number): number { return CIRCUMFERENCE - (pct / 100) * CIRCUMFERENCE; }
</script>

<template>
  <div v-if="store.toolbar.usage" class="specorator-context-meter" :class="{ warning: store.toolbar.usage.warning }" :data-tooltip="store.toolbar.usage.tooltip">
    <div class="specorator-context-meter-gauge">
      <svg viewBox="0 0 40 40">
        <path class="specorator-meter-bg" d="M 8 28 A 16 16 0 1 1 32 28" fill="none" />
        <path class="specorator-meter-fill" d="M 8 28 A 16 16 0 1 1 32 28" fill="none"
          :stroke-dasharray="CIRCUMFERENCE" :stroke-dashoffset="dashOffset(store.toolbar.usage.percentage)" />
      </svg>
    </div>
    <span class="specorator-context-meter-percent">{{ store.toolbar.usage.percentage }}%</span>
  </div>
</template>
```

> Copy the exact arc `d` path + gauge geometry from `ui/toolbar/ContextUsageMeter.ts` so the fill matches pixel-for-pixel; the values above are illustrative of the mechanism (`stroke-dashoffset = circumference − pct/100 · circumference`).

- [ ] **Step 4: Tests + commit** — visibility gating for each (MCP hidden when `!visible`; usage meter hidden when `usage === null`); MCP toggle fires `onToggleMcpServer`. External-context: the `.specorator-external-context-dropdown` is present in the DOM with NO open toggle (no `open` flag, no second wrapper); clicking `.specorator-external-context-icon-wrapper` fires `onAddExternalContext`; the empty state shows "Click the folder icon to add"; each item's path renders with the lock reflecting `item.persistent`; clicking the lock fires `onToggleExternalContextPersistence(path)` and the × fires `onRemoveExternalContext(path)`.

```bash
git add src/features/chat/ui/vue/composer/components/toolbar/ tests/vue/chat/composer/toolbar/
git commit -m "$(cat <<'EOF'
feat(chat): add composer Mcp/ExternalContext/ContextUsage/Send Vue widgets

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014VDsSXWHRqZr2EcNgDX2eq
EOF
)"
```

### Task 10: `ComposerToolbar.vue` cutover — render the widgets, delete `createInputToolbar`

**Files:**
- Modify: `src/features/chat/ui/vue/composer/components/ComposerToolbar.vue` (render widgets instead of hosting)
- Modify: `src/features/chat/tabs/tabUi.ts` (`initializeInputToolbar` no longer builds toolbar DOM; keeps constructing the non-visual selector INSTANCES the engine still reads — see note)
- Modify: `src/features/chat/ui/vue/composer/composerKeys.ts` (remove `TOOLBAR_HOST_KEY`), `mountComposer.ts`, `composerCallbacks.ts`, `tabComposerMount.ts` (remove `registerToolbarHost`), `types.ts` (remove `toolbarHostEl`)
- Delete: `src/features/chat/ui/InputToolbar.ts` and `src/features/chat/ui/toolbar/*.ts`
- Test: `tests/vue/chat/composer/composerToolbar.test.ts`

- [ ] **Step 1: Rewrite `ComposerToolbar.vue`**

```vue
<script setup lang="ts">
import ModelSelector from './toolbar/ModelSelector.vue';
import ThinkingBudgetSelector from './toolbar/ThinkingBudgetSelector.vue';
import ServiceTierToggle from './toolbar/ServiceTierToggle.vue';
import ContextUsageMeter from './toolbar/ContextUsageMeter.vue';
import ExternalContextSelector from './toolbar/ExternalContextSelector.vue';
import McpServerSelector from './toolbar/McpServerSelector.vue';
import PermissionToggle from './toolbar/PermissionToggle.vue';
import PlanModeToggle from './toolbar/PlanModeToggle.vue';
import ModeSelector from './toolbar/ModeSelector.vue';
</script>

<template>
  <div class="specorator-input-toolbar">
    <ModelSelector />
    <ThinkingBudgetSelector />
    <ServiceTierToggle />
    <ContextUsageMeter />
    <ExternalContextSelector />
    <McpServerSelector />
    <PermissionToggle />
    <PlanModeToggle />
    <ModeSelector />
  </div>
</template>
```

Preserve the exact widget ORDER `createInputToolbar` used (Model, Thinking, ServiceTier, ContextUsage, ExternalContext, Mcp, Permission, PlanMode, Mode — from `InputToolbar.ts`). There is NO send button (send is keyboard-only, strict parity).

- [ ] **Step 2: Strip the imperative toolbar build**

In `initializeInputToolbar`, delete the `createInputToolbar` call and the widget-instance assignments. **BUT** several engine paths still call methods on the selector instances (`tab.ui.mcpServerSelector.setMcpManager/getEnabledServers/setEnabledServers/addMentionedServers` — the `@server` mention sync via `fileContextManager.setOnMcpMentionChange` must keep working, and `InputController` sends `getEnabledServers()` with each turn; `tab.ui.externalContextSelector.getExternalContexts/getPersistentPaths/setPersistentPaths/setOnChange/setOnPersistenceChange/removePath/togglePersistence`; `tab.ui.contextUsageMeter.update`; `tab.ui.modelSelector?.updateDisplay`, etc.), and the projection reads `tab.ui.mcpServerSelector`/`externalContextSelector`. Resolve this cleanly: replace the DOM-rendering selector classes with **headless state holders** — small non-DOM classes exposing the same public methods the engine + projection call (`McpServerSelectionState`, `ExternalContextState`) — and keep constructing them in `initializeInputToolbar` (no `parentEl`). Delete `ModelSelector`/`ModeSelector`/`ThinkingBudgetSelector`/`ServiceTierToggle`/`PermissionToggle`/`PlanModeToggle`/`ContextUsageMeter` instances entirely (their `updateDisplay`/`renderOptions` calls in `refreshTabProviderUI`/`applyProviderUIGating`/`onModelChange` become `tab.composer?.emit()` — already added in Task 5, so just delete the imperative calls). This is the bulk of the LOC net-shrink.

> This step is the largest single edit. Work method-by-method: for each `tab.ui.<widget>?.<method>()` call site in `tabShared.ts`/`tabUi.ts`/`ConversationController`, either (a) it drove DOM → delete it and rely on `emit()`, or (b) it read/held state (mcp enabled set, external paths, usage) → keep it on the headless state holder. Run `npm run test -- --selectProjects unit` continuously; the existing `Tab.*` tests pin much of this behavior.

- [ ] **Step 3: Remove the toolbar host handle** — delete `TOOLBAR_HOST_KEY` (composerKeys.ts), its `app.provide` (mountComposer.ts), `registerToolbarHost` (composerCallbacks.ts + tabComposerMount.ts), and `toolbarHostEl` (types.ts + tabFactory.ts + ComposerToolbar's old host ref). `ComposerToolbar.vue` now renders `.specorator-input-toolbar` directly.

- [ ] **Step 4: Test** — `composerToolbar.test.ts` mounts `ComposerToolbar` over a stub store with a full toolbar slice and asserts all nine widget root classes render, and that a hidden widget (e.g. `mode: null`) is absent. Delete the obsolete `tests/unit/.../toolbar/*` imperative widget tests.

- [ ] **Step 5: Full green bar + visual parity check + commit.**

Run: `npm run typecheck && npm run typecheck:vue && npm run lint && npm run test:vue && npm run test -- --selectProjects unit && npm run build`

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(chat): render the composer toolbar as Vue widgets; delete imperative toolbar

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014VDsSXWHRqZr2EcNgDX2eq
EOF
)"
```

**Phase 2 complete.** The toolbar is fully Vue; `InputToolbar.ts` + `ui/toolbar/*` DOM widgets are deleted (headless state holders remain for MCP/external-context/usage).

# Phase 3 — Context chips + selection indicators + edited-files bar

`FileChips.vue` / `ImageChips.vue` are reactive `v-for`s over the projected `store.chips`; `EditedFilesBar.vue` is reactive over `store.editedFiles`. `SelectionIndicators.vue` is a **non-reactive host** for the three engine-driven indicators. Underlying `FileContextState` + image `Map` + `ChatState.editedFiles` stay in the engine and are projected; the mention dropdown stays imperative until Phase 5.

### Task 11: Project chips + edited files; add chip removal API + emit points

**Files:**
- Modify: `src/features/chat/tabs/tabComposer.ts` (`buildChips`, `buildEditedFiles`)
- Modify: `src/features/chat/ui/vue/composer/composerCallbacks.ts` (add `onRemoveChip`, `onOpenFile`, `onOpenEditedFile`, `onOpenImage`)
- Modify: `src/features/chat/ui/FileContext.ts` (add public `detachFilePill(path)`, `detachFolderPill(path)`, `clearCurrentNotePill()`)
- Modify: `src/features/chat/ui/ImageContext.ts` (add public `removeImageById(id)`, `openImageById(id)`)
- Modify: `src/features/chat/tabs/tabComposerMount.ts` (wire chip/edited callbacks)
- Modify: `src/features/chat/tabs/tabUi.ts` (emit on `onChipsChanged`/`onImagesChanged`/`onEditedFilesChanged`)
- Test: `tests/vue/chat/composer/chipsProjection.test.ts`

- [ ] **Step 1: Fill the projection slices** in `tabComposer.ts`:

```ts
import { basename, dirname } from '../../../utils/path'; // or the project's path helpers
import { resolveImageAttachmentSrc } from '../utils/imageAttachment';
import { formatBytes } from '../../../utils/format'; // use the project's byte formatter

  private buildChips(): ComposerChips {
    const fc = this.tab.ui.fileContextManager;
    const currentPath = fc?.getCurrentNotePath?.() ?? null;
    const currentNote: ComposerFileChip | null = currentPath
      ? { path: currentPath, label: basename(currentPath), kind: 'current' }
      : null;
    const files: ComposerFileChip[] = [];
    for (const p of fc?.getAttachedFiles() ?? new Set<string>()) {
      if (p === currentPath) continue; // the current note renders once, as currentNote
      files.push({ path: p, label: basename(p), kind: 'file' });
    }
    const folders: ComposerFolderChip[] = [];
    for (const p of fc?.getAttachedFolders() ?? new Set<string>()) {
      folders.push({ path: p, label: `${basename(p)}/` });
    }
    // `ImageContextManager` keys attachments by generated `id` (Map<id, …>) and
    // `ImageAttachment.path` is optional (only stamped on send), so a pasted/dropped
    // image is removable ONLY by id — the chip carries `id`, and removal uses
    // `onRemoveChip(id, 'image')` (id, NOT path).
    const images: ComposerImageChip[] = (this.tab.ui.imageContextManager?.getAttachedImages() ?? []).map((img) => ({
      id: img.id, name: img.name, sizeLabel: formatBytes(img.size),
      src: resolveImageAttachmentSrc(this.plugin.app, img) ?? `data:${img.mediaType};base64,${img.data}`,
    }));
    return { currentNote, files, folders, images };
  }

  private buildEditedFiles(): ComposerEditedFile[] {
    return this.tab.state.editedFiles.map((e) => ({
      path: e.path, changeKind: e.changeKind, name: basename(e.path), dir: dirname(e.path),
    }));
  }
```

Add `ComposerFileChip`, `ComposerFolderChip`, `ComposerImageChip` to the `composerStore` type import at the top of `tabComposer.ts` (they were not needed while `buildChips` returned empties). Match the exact chip label rules to `FileChipsView` (folder label `${basename}/`; the current-note is projected + removed SEPARATELY from `files`, not merged) and the image size format to `ImageContextManager`.

- [ ] **Step 2: Add the callbacks** to `ComposerCallbacks` (ONE unified chip remover + open):

```ts
  /** Remove a chip. `key` is a vault path for 'current'/'file'/'folder', the image
   *  id for 'image'. Removing 'current' clears FileContextState.currentNotePath so
   *  `shouldSendCurrentNote()` stops sending it. */
  onRemoveChip: (key: string, kind: 'current' | 'file' | 'folder' | 'image') => void;
  /** Open the full-size preview for an image chip (by attachment id) — mirrors the
   *  imperative thumbnail click → showFullImage → openImageModal. */
  onOpenImage: (id: string) => void;
  /** Open a current/file/folder chip's path in a new tab. */
  onOpenFile: (path: string) => void;
  /** Open an agent-edited file — RE-RESOLVES the created/edited path at click time
   *  (a file deleted after listing surfaces a Notice; the only way to open
   *  agent-changed files). */
  onOpenEditedFile: (path: string) => void;
```

- [ ] **Step 3: Add public removal APIs** — in `FileContext.ts`:

```ts
  detachFilePill(path: string): void { this.state.detachFile(path); this.refreshChips(); }
  detachFolderPill(path: string): void { this.state.detachFolder(path); this.refreshChips(); }
  // Removing the current-note pill must clear the tracked path, else
  // `shouldSendCurrentNote()` keeps attaching it to the next turn.
  clearCurrentNotePill(): void { this.state.setCurrentNotePath(null); this.refreshChips(); }
```

(`refreshChips` already fires `callbacks.onChipsChanged`; keep it private but callable here. Use `FileContextState`'s real current-note setter name — verify: `setCurrentNotePath` / `clearCurrentNote`.) In `ImageContext.ts`:

```ts
  removeImageById(id: string): void {
    if (this.attachedImages.delete(id)) { this.updateImagePreview(); this.callbacks.onImagesChanged(); }
  }
  // Opens the full-size preview — reuses the EXISTING modal opener (showFullImage →
  // openImageModal), which is RETAINED in Task 12 (only the preview-thumbnail DOM
  // rendering is deleted). Verify the exact private method name in ImageContext.ts.
  openImageById(id: string): void {
    const image = this.attachedImages.get(id);
    if (image) this.showFullImage(image);
  }
```

- [ ] **Step 4: Wire callbacks + emit** in `tabComposerMount.ts` (reuse the re-resolving `openEditedFile` helper from `tabUi.ts` — export it):

```ts
    onRemoveChip: (key, kind) => {
      const fc = tab.ui.fileContextManager;
      if (kind === 'image') tab.ui.imageContextManager?.removeImageById(key);
      else if (kind === 'folder') fc?.detachFolderPill(key);
      else if (kind === 'current') fc?.clearCurrentNotePill();
      else fc?.detachFilePill(key);
      tab.composer?.emit();
    },
    onOpenImage: (id) => { tab.ui.imageContextManager?.openImageById(id); },
    onOpenFile: (path) => { void plugin.app.workspace.openLinkText(path, '', 'tab'); },
    onOpenEditedFile: (path) => { openEditedFile(plugin.app, path); },
```

Import `openEditedFile` from `./tabUi` (make it exported). It re-resolves via `resolveOpenableVaultPath` and shows a Notice when the file no longer exists — identical to the deleted `EditedFilesView` open path.

In `tabUi.ts`, add `tab.composer?.emit();` inside the `onChipsChanged`, `onImagesChanged`, and `onEditedFilesChanged` callbacks (after the existing bodies). Because chip/image mutations happen through the engine (mention selection, drop, paste), the projection stays live.

- [ ] **Step 5: Test + commit** — `chipsProjection.test.ts`: a stub tab with a current note + attached files/folders + images + editedFiles produces the projected slices — `currentNote` is its OWN field (not in `files`; a file equal to the current path is de-duped out of `files`), `folders` are separate, image src/size resolve. Then commit.

```bash
git add -A && git commit -m "$(cat <<'EOF'
feat(chat): project composer chips + edited files; add chip removal API

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014VDsSXWHRqZr2EcNgDX2eq
EOF
)"
```

### Task 12: `FileChips.vue` + `ImageChips.vue` (reactive) and cut over the context row

**Files:** Create `.../composer/components/context/FileChips.vue`, `ImageChips.vue`; Modify `ComposerContextRow.vue`; Modify `tabUi.ts` (stop imperative chip rendering); Test.

- [ ] **Step 1: `FileChips.vue`** — MUST render inside `.specorator-file-indicator` carrying `.specorator-visible-flex` when non-empty (empty removes it), so `updateContextRowHasContent` still sees content:

```vue
<script setup lang="ts">
import { computed, inject } from 'vue';
import { setIcon } from 'obsidian';
import { CALLBACKS_KEY } from '../../composerKeys';
import { useComposerStore } from '../../stores/composerStore';

type Pill = { path: string; label: string; kind: 'current' | 'file' | 'folder' };

const store = useComposerStore();
const cb = inject(CALLBACKS_KEY);
// One flat pill list: current note first, then attached files, then folders —
// each is click-to-open and removable. Removing 'current' clears the tracked
// current-note path (engine); files/folders detach their pill.
const pills = computed<Pill[]>(() => {
  const out: Pill[] = [];
  const c = store.chips.currentNote;
  if (c) out.push({ path: c.path, label: c.label, kind: 'current' });
  for (const f of store.chips.files) out.push({ path: f.path, label: f.label, kind: 'file' });
  for (const d of store.chips.folders) out.push({ path: d.path, label: d.label, kind: 'folder' });
  return out;
});
function icon(el: HTMLElement | null, kind: string): void {
  if (el) setIcon(el, kind === 'folder' ? 'folder' : kind === 'current' ? 'file-check' : 'file-text');
}
</script>

<template>
  <div class="specorator-file-indicator" :class="{ 'specorator-visible-flex': pills.length > 0, 'specorator-hidden': pills.length === 0 }">
    <div
      v-for="pill in pills"
      :key="`${pill.kind}:${pill.path}`"
      class="specorator-file-chip"
      :class="`specorator-file-chip--${pill.kind}`"
    >
      <span :ref="(el) => icon(el as HTMLElement, pill.kind)" class="specorator-file-chip-icon" />
      <span class="specorator-file-chip-name" :title="pill.path" @click="cb?.onOpenFile(pill.path)">{{ pill.label }}</span>
      <span class="specorator-file-chip-remove" aria-label="Remove" @click="cb?.onRemoveChip(pill.path, pill.kind)">×</span>
    </div>
  </div>
</template>
```

- [ ] **Step 2: `ImageChips.vue`** — inside `.specorator-image-preview` with the same `.specorator-visible-flex` rule:

```vue
<script setup lang="ts">
import { computed, inject } from 'vue';
import { CALLBACKS_KEY } from '../../composerKeys';
import { useComposerStore } from '../../stores/composerStore';

const store = useComposerStore();
const cb = inject(CALLBACKS_KEY);
const images = computed(() => store.chips.images);
</script>

<template>
  <div class="specorator-image-preview" :class="{ 'specorator-visible-flex': images.length > 0, 'specorator-hidden': images.length === 0 }">
    <div v-for="img in images" :key="img.id" class="specorator-image-chip">
      <span class="specorator-image-thumb" role="button" @click="cb?.onOpenImage(img.id)"><img :src="img.src" :alt="img.name"></span>
      <span class="specorator-image-info">
        <span class="specorator-image-name" :title="img.name">{{ img.name }}</span>
        <span class="specorator-image-size">{{ img.sizeLabel }}</span>
      </span>
      <!-- .stop so removing does NOT also fire the thumbnail's open-preview click. -->
      <span class="specorator-image-remove" aria-label="Remove image" @click.stop="cb?.onRemoveChip(img.id, 'image')">×</span>
    </div>
  </div>
</template>
```

- [ ] **Step 3: Render them in the context row** — update `ComposerContextRow.vue` to render (preserving the imperative order: image-preview, file-indicator, then indicators added in Task 13):

```vue
<template>
  <div ref="el" class="specorator-context-row">
    <ImageChips />
    <FileChips />
    <!-- SelectionIndicators added in Task 13 -->
  </div>
</template>
```

(Keep the `CONTEXT_ROW_KEY` registration script from Phase 1 unchanged; add the `ImageChips`/`FileChips` imports.)

- [ ] **Step 4: Delete imperative chip rendering** — in `FileContext.ts` remove the `FileChipsView` construction + `refreshChips` DOM calls (keep `state` + `refreshChips`'s `onChipsChanged` fire; it now only emits). In `ImageContext.ts` remove `renderImagePreview()`/`updateImagePreview`'s thumbnail DOM building + the `previewContainerEl.createDiv('specorator-image-preview')` (keep the `Map` + `onImagesChanged` fire). **RETAIN `showFullImage`/`openImageModal`** — the full-size preview opener is still used by `openImageById` (Task 11) for the Vue thumbnail click; only the preview-STRIP rendering is deleted. Delete `src/features/chat/ui/file-context/view/FileChipsView.ts`. The managers become state + mention-dropdown + image-modal owners only.

> `FileChipsView` also owned the open path; that is now `onOpenFile`. Verify no other caller of `FileChipsView`.

- [ ] **Step 5: Test + commit** — mount `FileChips`/`ImageChips` over stub slices; assert: the current note renders as a `.specorator-file-chip--current` pill alongside files/folders; `.specorator-visible-flex` toggles with the pill/image count; clicking a pill fires `onOpenFile(path)`; the remove × fires `onRemoveChip(path, kind)` — and removing the current pill fires `onRemoveChip(currentPath, 'current')`. For images: clicking the `.specorator-image-thumb` fires `onOpenImage(img.id)` (click-to-open preserved); the remove × fires `onRemoveChip(img.id, 'image')` and — because of `@click.stop` — does NOT also fire `onOpenImage` (no double-fire). Commit.

```bash
git add -A && git commit -m "$(cat <<'EOF'
feat(chat): render composer file/image chips as reactive Vue components

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014VDsSXWHRqZr2EcNgDX2eq
EOF
)"
```

### Task 13: `SelectionIndicators.vue` (host) + `EditedFilesBar.vue` (reactive)

**Files:** Create `.../composer/components/context/SelectionIndicators.vue`, `.../composer/components/EditedFilesBar.vue`; Modify `ComposerContextRow.vue`, `ComposerWrapper.vue`/`ComposerEditedFilesRow.vue`; Modify `tabUi.ts` (register indicators via handles; delete `EditedFilesView`); Test.

- [ ] **Step 1: `SelectionIndicators.vue`** — non-reactive host; renders the three indicator `<div>`s with initial `.specorator-hidden` and hands the raw nodes to the engine controllers:

```vue
<script setup lang="ts">
import { inject, onMounted, ref } from 'vue';
import { BROWSER_INDICATOR_KEY, CANVAS_INDICATOR_KEY, SELECTION_INDICATOR_KEY } from '../../composerKeys';

const sel = ref<HTMLElement | null>(null);
const browser = ref<HTMLElement | null>(null);
const canvas = ref<HTMLElement | null>(null);
const regSel = inject(SELECTION_INDICATOR_KEY, undefined);
const regBrowser = inject(BROWSER_INDICATOR_KEY, undefined);
const regCanvas = inject(CANVAS_INDICATOR_KEY, undefined);
onMounted(() => {
  if (sel.value && regSel) regSel(sel.value);
  if (browser.value && regBrowser) regBrowser(browser.value);
  if (canvas.value && regCanvas) regCanvas(canvas.value);
});
</script>

<template>
  <div ref="sel" class="specorator-selection-indicator specorator-hidden" />
  <div ref="browser" class="specorator-browser-selection-indicator specorator-hidden" />
  <div ref="canvas" class="specorator-canvas-indicator specorator-hidden" />
</template>
```

Add `<SelectionIndicators />` after `<FileChips />` in `ComposerContextRow.vue`.

- [ ] **Step 2: Provide the three indicator handles** — add `registerSelectionIndicator`/`registerBrowserIndicator`/`registerCanvasIndicator` to `ComposerCallbacks`, provide them in `mountComposer` under the three keys, and in `tabComposerMount` write them to `tab.dom.selectionIndicatorEl`/`browserIndicatorEl`/`canvasIndicatorEl`. In `tabUi.ts` DELETE the three `dom.contextRowEl.createDiv('specorator-*-indicator ...')` lines (Vue renders them now); the handles are set on mount before `buildTabSelectionControllers` reads them (mount runs before `initializeTabControllers`).

> Ordering: `buildTabSelectionControllers` (in `initializeTabControllers`) reads `dom.selectionIndicatorEl!` — non-null asserted. Since `mountTabComposer` runs before `initializeTabControllers`, the handles are set. Remove the `!` non-null concern by confirming registration; keep the assertion.

- [ ] **Step 3: `EditedFilesBar.vue`** — reactive over `store.editedFiles`; reproduce `EditedFilesView`'s badge + popover (`.specorator-edited-files*` classes), self-hiding when empty:

```vue
<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import { setIcon } from 'obsidian';
import { CALLBACKS_KEY } from '../composerKeys';
import { useComposerStore } from '../stores/composerStore';

const store = useComposerStore();
const cb = inject(CALLBACKS_KEY);
const open = ref(false);
const entries = computed(() => store.editedFiles);
const createdCount = computed(() => entries.value.filter((e) => e.changeKind === 'created').length);
const editedCount = computed(() => entries.value.filter((e) => e.changeKind === 'edited').length);
const countLabel = computed(() => `${createdCount.value} created · ${editedCount.value} edited`);
function badgeIcon(el: HTMLElement | null): void { if (el) setIcon(el, 'file-pen'); }
function chevron(el: HTMLElement | null): void { if (el) setIcon(el, 'chevron-down'); }
function itemIcon(el: HTMLElement | null, kind: string): void { if (el) setIcon(el, kind === 'created' ? 'file-plus' : 'file-pen'); }
</script>

<template>
  <div
    class="specorator-edited-files-row"
    :class="{ 'specorator-visible-flex': entries.length > 0, 'specorator-hidden': entries.length === 0 }"
  >
    <div v-if="entries.length > 0" class="specorator-edited-files">
      <div class="specorator-edited-files-badge" role="button" tabindex="0" aria-haspopup="menu" :aria-expanded="open" @click="open = !open" @keydown.enter.prevent="open = !open" @keydown.space.prevent="open = !open">
        <span :ref="(el) => badgeIcon(el as HTMLElement)" class="specorator-edited-files-badge-icon" />
        <span class="specorator-edited-files-badge-count">{{ countLabel }}</span>
        <span :ref="(el) => chevron(el as HTMLElement)" class="specorator-edited-files-badge-chevron" />
      </div>
      <div v-if="open" class="specorator-edited-files-menu" role="menu">
        <div
          v-for="entry in entries"
          :key="entry.path"
          class="specorator-edited-files-item"
          :class="`specorator-edited-files-item--${entry.changeKind}`"
          role="menuitem"
          tabindex="0"
          @click="open = false; cb?.onOpenEditedFile(entry.path)"
          @keydown.enter.prevent="open = false; cb?.onOpenEditedFile(entry.path)"
        >
          <span :ref="(el) => itemIcon(el as HTMLElement, entry.changeKind)" class="specorator-edited-files-item-icon" />
          <span class="specorator-edited-files-item-name" :title="entry.path">{{ entry.name }}</span>
          <span class="specorator-edited-files-item-dir">{{ entry.dir }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
```

Render `<EditedFilesBar />` in place of the `ComposerEditedFilesRow` host in `ComposerWrapper.vue` (delete `ComposerEditedFilesRow.vue`, `EDITED_FILES_ROW_KEY`, `registerEditedFilesRow`, and `editedFilesRowEl` if no other consumer reads it — verify; `ChatState.editedFiles` is the source and stays). Reproduce `EditedFilesView`'s outside-click / Escape dismissal (a document `mousedown`/`keydown` listener registered via the injected `COMPONENT_KEY`'s `registerDomEvent` for auto-cleanup, matching the imperative dismissal).

- [ ] **Step 4: Delete `EditedFilesView`** — remove `src/features/chat/ui/EditedFilesView.ts`, its construction + `render` calls in `tabUi.ts`. The `onEditedFilesChanged` callback keeps only `autoResizeTextarea(dom.inputEl)` + `tab.composer?.emit()`.

- [ ] **Step 5: Test + commit** — `SelectionIndicators` registers three handles; a selection controller mutating an indicator's `textContent`/`.specorator-hidden` still works (drive `SelectionController`-style mutation directly). `EditedFilesBar`: renders the badge/count when entries exist, hides when empty; the badge TOGGLES the popover (click opens, click/Escape/outside-click closes); a row ACTIVATES by click and by Enter/Space, firing `onOpenEditedFile(path)` (which re-resolves the created/edited file). Commit.

```bash
git add -A && git commit -m "$(cat <<'EOF'
feat(chat): host selection indicators + render edited-files bar in Vue

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014VDsSXWHRqZr2EcNgDX2eq
EOF
)"
```

**Phase 3 complete.** Chips + edited-files render reactively; selection indicators are Vue-hosted engine-driven nodes; `FileChipsView` + `EditedFilesView` deleted.

# Phase 4 — Textarea host hard cutover (the riskiest task)

`ComposerTextarea.vue` renders the `<textarea class="specorator-input">` itself and hands the raw node to the engine via `INPUT_EL_KEY`. Vue **never** `v-model`s it and never re-renders it — `.value`, height, selection, and IME composition stay opaque engine-owned state. `tabInputWiring` and every controller keep operating on the same real node. Vue drives only surrounding chrome (placeholder, streaming-disabled) from the store.

### Task 14: `ComposerTextarea.vue` renders the textarea; re-point the engine at the Vue node

**Files:**
- Modify: `src/features/chat/ui/vue/composer/components/ComposerTextarea.vue` (render `<textarea>`, register `INPUT_EL_KEY`)
- Modify: `src/features/chat/ui/vue/composer/composerKeys.ts` (remove `TEXTAREA_HOST_KEY`), `mountComposer.ts` (provide `INPUT_EL_KEY`, drop `TEXTAREA_HOST_KEY`), `composerCallbacks.ts` (replace `registerTextareaHost` with `registerInputEl`), `tabComposerMount.ts` (register the raw node to `tab.dom.inputEl`)
- Modify: `src/features/chat/tabs/tabFactory.ts` (`buildTabDOM` no longer creates the textarea)
- Test: `tests/vue/chat/composer/composerTextarea.test.ts`

- [ ] **Step 1: Rewrite `ComposerTextarea.vue`**

```vue
<script setup lang="ts">
import { inject, onMounted, ref } from 'vue';

import { INPUT_EL_KEY } from '../composerKeys';

// Vue RENDERS the element but the engine OWNS its behavior. We register the raw
// node once and NEVER bind v-model, NEVER re-render it, and bind NO reactive
// attributes: `.value`, height, caret, IME composition, `disabled`, AND the
// `placeholder` are all opaque engine-owned state after mount. `InputController`
// writes `.value`; `autoResizeTextarea` runs on input; `SelectionController` /
// `ChatDropController` attach listeners here; `TriggerInputMode` sets
// `inputEl.placeholder` directly for `#`/`!` modes and restores the default on
// exit. A v-model or reactive `:disabled`/`:placeholder` would fight the engine
// (IME/caret/placeholder) — the static attributes below are the initial values
// only; the engine mutates the live properties. This is the entire cutover risk,
// contained to "Vue touches this node exactly once (to register it)".
const el = ref<HTMLTextAreaElement | null>(null);
const register = inject(INPUT_EL_KEY, undefined);
onMounted(() => {
  if (el.value && el.value.nodeType === 1 && register) register(el.value);
});
</script>

<template>
  <textarea
    ref="el"
    class="specorator-input"
    dir="auto"
    rows="3"
    placeholder="How can i help you today?"
  />
</template>
```

> **No reactive bindings, by decision.** Typing-while-streaming is allowed (queued follow-ups + Escape-to-cancel), so there is NO `:disabled`. The placeholder stays engine-owned (`TriggerInputMode` sets it for `#`/`!` modes and restores the default on exit); the static `placeholder` attribute is just the initial default. `dir`/`rows` are static (unchanged from `buildTabDOM`). After `onMounted` registers the node, Vue never touches it again — the safest possible contract for the one Vue-hostile surface.

- [ ] **Step 2: Swap the handle key** — in `composerKeys.ts` delete `TEXTAREA_HOST_KEY`. In `composerCallbacks.ts` replace `registerTextareaHost` with `registerInputEl: (el: HTMLTextAreaElement) => void;`. In `mountComposer.ts` replace the `TEXTAREA_HOST_KEY` provide with `app.provide(INPUT_EL_KEY, callbacks.registerInputEl);`. In `tabComposerMount.ts` replace `registerTextareaHost` with:

```ts
    registerInputEl: (el) => { tab.dom.inputEl = el; },
```

- [ ] **Step 3: Stop creating the textarea in `buildTabDOM`** — remove the detached `<textarea>` creation from `buildTabDOM`. `tab.dom.inputEl` is set by `registerInputEl` on mount, which runs (mountTabComposer) BEFORE `initializeTabUI`/`initializeTabControllers`/`wireTabInputEvents` read it. To satisfy the non-null `HTMLTextAreaElement` type between `createTab` and mount, initialize it to a detached placeholder that the register overwrites (mirror the other placeholders):

```ts
  // Overwritten by registerInputEl on mount, before any consumer reads it.
  const inputEl = contentEl.ownerDocument.createElement('textarea');
```

Keep this one line; delete the `className`/attribute setup (the Vue `<textarea>` carries them). The placeholder is never parented and is GC'd once `registerInputEl` repoints `tab.dom.inputEl`.

- [ ] **Step 4: Write the no-clobber / Mod+Enter / IME tests** (the crux)

`tests/vue/chat/composer/composerTextarea.test.ts`:

```ts
import '@/providers';
import { flushPromises } from '@vue/test-utils';
import { App, Component } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mountTabComposer } from '@/features/chat/tabs/tabComposerMount';
import { wireTabInputEvents } from '@/features/chat/tabs/tabInputWiring';
import type { TabData } from '@/features/chat/tabs/types';
import type SpecoratorPlugin from '@/main';

// Reuse the makeTab/makePlugin helpers from tabComposerMount.test.ts (extract to a
// shared tests/vue/chat/composer/_kit.ts). The tab stub exposes a real
// inputController with a sendMessage spy + a real ChatState-like state.

function mountAndWire(): { tab: TabData; textarea: HTMLTextAreaElement } {
  const tab = /* makeTab() from _kit */ null as unknown as TabData;
  mountTabComposer(tab, /* makePlugin() */ {} as SpecoratorPlugin, new Component());
  const textarea = tab.dom.inputEl;
  wireTabInputEvents(tab, {} as SpecoratorPlugin);
  return { tab, textarea };
}

describe('ComposerTextarea (hard cutover)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('registers the Vue-rendered textarea as tab.dom.inputEl', async () => {
    const tab = /* makeTab */ null as unknown as TabData;
    mountTabComposer(tab, {} as SpecoratorPlugin, new Component());
    await flushPromises();
    expect(tab.dom.inputEl).toBe(tab.dom.composerHostEl.querySelector('textarea.specorator-input'));
  });

  it('Vue never clobbers .value or selection after mount', async () => {
    const { textarea } = mountAndWire();
    await flushPromises();
    textarea.value = 'hello world';
    textarea.setSelectionRange(2, 5);
    // Force a store change that re-renders siblings; the textarea must be untouched.
    // (Push a projection emit — e.g. streaming toggles the send slice.)
    await flushPromises();
    expect(textarea.value).toBe('hello world');
    expect(textarea.selectionStart).toBe(2);
    expect(textarea.selectionEnd).toBe(5);
    expect(textarea.isConnected).toBe(true);
  });

  it('Mod+Enter still routes through tabInputWiring to sendMessage', async () => {
    const { tab, textarea } = mountAndWire();
    await flushPromises();
    textarea.value = 'send me';
    // Focus so the explicit-enter short-circuit's focus guard passes.
    textarea.focus();
    const evt = new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true, cancelable: true });
    textarea.dispatchEvent(evt);
    expect(tab.controllers.inputController!.sendMessage).toHaveBeenCalledTimes(1);
    expect(evt.defaultPrevented).toBe(true);
  });

  it('does NOT send while composing (IME) — isComposing short-circuits', async () => {
    const { tab, textarea } = mountAndWire();
    await flushPromises();
    textarea.value = '日本語';
    textarea.focus();
    // KeyboardEvent isComposing is read-only; construct with the flag.
    const evt = Object.assign(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }), { isComposing: true });
    Object.defineProperty(evt, 'isComposing', { value: true });
    textarea.dispatchEvent(evt);
    expect(tab.controllers.inputController!.sendMessage).not.toHaveBeenCalled();
  });
});
```

> These four assertions ARE the risk mitigation. If any fails, stop and fix before proceeding — the textarea is the one surface where a Vue mistake silently breaks IME/caret. The `_kit.ts` tab stub must give `wireTabInputEvents` a real `inputController.sendMessage` spy, a `state` with `isStreaming`, and the `ui.instructionModeManager`/`bangBashModeManager`/`slashCommandDropdown`/`fileContextManager` as `null` (so the keydown handler falls through to the send short-circuit).

- [ ] **Step 5: Full green bar + visual parity (IME + caret + send) + commit**

Manually verify: typing, caret placement, IME composition (if available), Enter/Mod+Enter send per `requireCommandOrControlEnterToSend`, Escape-cancel during streaming, autoresize, and draft persistence across tab switches.

```bash
git add -A && git commit -m "$(cat <<'EOF'
feat(chat): render the composer textarea in Vue (engine-driven, no v-model)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014VDsSXWHRqZr2EcNgDX2eq
EOF
)"
```

**Phase 4 complete.** The textarea is Vue-rendered, engine-driven. The primary input→transcript loop is now fully Vue except the dropdowns.

# Phase 5 — Dropdowns (slash / mention / resume)

Rendering migrates to Vue; the engine keeps trigger-detection + the data-fetch state machine (catalog queries, mention providers, resume sessions). The store projects `dropdown: { kind, items, activeIndex, anchorRect }`; the components render it and report `up/down/enter/escape` + click through `onDropdownNavigate/Select/Dismiss`. `shared/components/SlashCommandDropdown.ts` STAYS in place for `InlineEditModal` — the chat composer stops importing it; shared **behavior** helpers (`dropdownNavigation.ts`, the caret/anchor math, the item-filtering functions) are reused by both surfaces so there is no clone-group regression.

### Task 15: Extract shared helpers; project the dropdown slice; add navigation callbacks

**Files:**
- Create: `src/features/chat/ui/vue/composer/dropdowns/dropdownAnchor.ts` (caret-rect math extracted from the imperative `positionFixed`)
- Modify: `src/shared/components/SlashCommandDropdown.ts` / `MentionDropdownController.ts` / `ResumeSessionDropdown.ts` (extract pure item-building/filtering into exported functions; keep their existing render for inline-edit's `SlashCommandDropdown`)
- Modify: `src/features/chat/tabs/tabComposer.ts` (`buildDropdown` — projects the active dropdown state held by a new coordinator)
- Create: `src/features/chat/controllers/ComposerDropdownCoordinator.ts` (chat-only: owns the active `{ kind, items, activeIndex, anchorRect }`, driven by the existing detection, and calls `tab.composer?.emit()`)
- Modify: `src/features/chat/ui/vue/composer/composerCallbacks.ts` (add `onDropdownNavigate`, `onDropdownSelect`, `onDropdownDismiss`)
- Test: `tests/vue/chat/composer/dropdownProjection.test.ts`

- [ ] **Step 1: Extract the caret/anchor math**

`src/features/chat/ui/vue/composer/dropdowns/dropdownAnchor.ts`:

```ts
import type { ComposerDropdownAnchor } from '../stores/composerStore';

// Anchors the dropdown to the composer textarea rect (the imperative dropdowns
// anchored to inputEl.getBoundingClientRect(), NOT a per-caret rect — see
// positionFixed). Mirrors the three --specorator-fixed-dropdown-* vars.
export function anchorFromInput(inputEl: HTMLTextAreaElement): ComposerDropdownAnchor {
  const r = inputEl.getBoundingClientRect();
  return { top: r.top, left: r.left, width: Math.max(r.width, 280) };
}
```

- [ ] **Step 2: Introduce the chat dropdown coordinator**

`src/features/chat/controllers/ComposerDropdownCoordinator.ts` holds the active dropdown state for one tab and is the single source `buildDropdown` reads. It exposes:

```ts
export interface ComposerDropdownCoordinatorState {
  kind: 'slash' | 'mention' | 'resume' | null;
  items: ComposerDropdownItem[];
  activeIndex: number;
  anchorRect: ComposerDropdownAnchor | null;
}
```

**State methods** the existing detection calls instead of rendering: `showSlash(items, inputEl)`, `showMention(items, inputEl)`, `showResume(items, inputEl)`, `setActiveIndex(i)`, `move(delta)` (clamped via `clampSelectionIndex`), `hide()`, plus `selectActive(): void` (delegates to the owning detector's insert logic). Each mutation calls the injected `emit` (`() => tab.composer?.emit()`).

**Keyboard-bridge methods** — CRITICAL, because `tabInputWiring` and `NavigationController` call the objects the coordinator replaces (see Step 2b). The coordinator MUST expose:

```ts
  /** Consumes Arrow/Enter/Escape when a dropdown is open; returns true if handled
   *  (so tabInputWiring's keydownHandler short-circuits before its send path). */
  handleKeydown(e: KeyboardEvent): boolean;
  /** True while a dropdown is open (NavigationController.shouldSkipEscapeHandling
   *  reads this so Escape dismisses the dropdown instead of blurring the input). */
  isVisible(): boolean;
  /** Enable/disable trigger handling (bang-bash suppression parity — tabInputWiring
   *  calls setEnabled(!bangBashActive)). */
  setEnabled(enabled: boolean): void;
```

`handleKeydown` implements the exact Arrow/Enter/Tab/Escape behavior the imperative dropdowns' `handleKeydown` did (reuse the shared `dropdownNavigation.ts` helpers): ArrowUp/Down → `move(±1)`; Enter/Tab → `selectActive()` + return true; Escape → `hide()` + return true; returns false when no dropdown is open so the keydown falls through.

The IMPERATIVE chat `SlashCommandDropdown`/`MentionDropdownController`/`ResumeSessionDropdown` are refactored so their `render`/`show`/`updateSelection` DELEGATE to the coordinator (`coordinator.showX(items, inputEl)`) instead of creating DOM, and their `handleKeydown`/`isVisible`/`setEnabled` DELEGATE to the coordinator's bridge — detection + insert logic untouched. The inline-edit copy of `SlashCommandDropdown` keeps its own DOM render (its constructor still creates `.specorator-slash-dropdown` into `document.body`).

> This is the phase's core refactor. Keep the item-building/filtering functions pure and shared (export them from the shared module) so both the inline-edit DOM render and the chat coordinator build identical item lists — `check:quality` clone detection is the guard; resolve any duplication by extracting, never by baseline bump.

- [ ] **Step 3: Project + callbacks** — `buildDropdown()` returns `tab.controllers.composerDropdownCoordinator?.getState() ?? EMPTY_DROPDOWN`. Add to `ComposerCallbacks`:

```ts
  onDropdownNavigate: (direction: 1 | -1) => void;
  onDropdownSelect: (index: number) => void;
  onDropdownDismiss: () => void;
```

Wire in `tabComposerMount`:

```ts
    onDropdownNavigate: (d) => { tab.controllers.composerDropdownCoordinator?.move(d); },
    onDropdownSelect: (i) => { tab.controllers.composerDropdownCoordinator?.setActiveIndex(i); tab.controllers.composerDropdownCoordinator?.selectActive(); },
    onDropdownDismiss: () => { tab.controllers.composerDropdownCoordinator?.hide(); },
```

Construct the coordinator in `initializeTabControllers` (it needs `tab` + the emit closure); the existing dropdown detectors receive it.

- [ ] **Step 4: Test + commit** — `dropdownProjection.test.ts`: driving `coordinator.showSlash([...], inputEl)` projects `{ kind: 'slash', items, activeIndex: 0, anchorRect }`; `move(1)` clamps; `hide()` clears. Commit.

```bash
git add -A && git commit -m "$(cat <<'EOF'
feat(chat): project composer dropdown state via a chat dropdown coordinator

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014VDsSXWHRqZr2EcNgDX2eq
EOF
)"
```

### Task 16: `SlashCommandDropdown.vue` + `MentionDropdown.vue` + `ResumeSessionDropdown.vue`

**Files:** Create `.../composer/dropdowns/SlashCommandDropdown.vue`, `MentionDropdown.vue`, `ResumeSessionDropdown.vue`, and a shared `DropdownList.vue`; Render them in `ComposerTextarea`'s host; Test.

- [ ] **Step 1: Shared `DropdownList.vue`** (one list renderer, three skins) prevents a clone group:

```vue
<script setup lang="ts">
import type { ComposerDropdownItem } from '../stores/composerStore';
defineProps<{
  items: ComposerDropdownItem[];
  activeIndex: number;
  rootClass: string;
  itemClass: string;
  emptyClass: string;
  emptyText: string;
}>();
const emit = defineEmits<{ (e: 'select', index: number): void }>();
</script>

<template>
  <div :class="rootClass">
    <div v-if="items.length === 0" :class="emptyClass">{{ emptyText }}</div>
    <div
      v-for="(item, i) in items"
      :key="item.id"
      :class="[itemClass, item.variant, { selected: i === activeIndex }]"
      @mousedown.prevent="emit('select', i)"
    >
      <span class="specorator-dropdown-primary">{{ item.primary }}</span>
      <span v-if="item.hint" class="specorator-dropdown-hint">{{ item.hint }}</span>
      <span v-if="item.secondary" class="specorator-dropdown-secondary">{{ item.secondary }}</span>
    </div>
  </div>
</template>
```

> `@mousedown.prevent` (not `@click`): the imperative dropdowns selected on mousedown to avoid the textarea losing focus before insert. Map `item.primary/secondary/hint/variant` from each detector's real item fields when building the projected `ComposerDropdownItem[]` (slash: name/desc/argumentHint; mention: name/path + per-type `variant`; resume: title/date). Add the legacy child classnames (`specorator-slash-name` etc.) if the existing CSS targets them — reproduce them via `:class` or extra spans so the stylesheet still applies.

- [ ] **Step 2: The three skins** — each is a thin wrapper over `DropdownList` reading `store.dropdown` and injecting `CALLBACKS_KEY`, rendered only when `store.dropdown.kind` matches, positioned from `store.dropdown.anchorRect`:

```vue
<!-- SlashCommandDropdown.vue -->
<script setup lang="ts">
import { computed, inject } from 'vue';
import DropdownList from './DropdownList.vue';
import { CALLBACKS_KEY } from '../composerKeys';
import { useComposerStore } from '../stores/composerStore';
const store = useComposerStore();
const cb = inject(CALLBACKS_KEY);
const show = computed(() => store.dropdown.kind === 'slash');
const style = computed(() => store.dropdown.anchorRect
  ? { '--specorator-fixed-dropdown-bottom': `${window.innerHeight - store.dropdown.anchorRect.top + 4}px`,
      '--specorator-fixed-dropdown-left': `${store.dropdown.anchorRect.left}px`,
      '--specorator-fixed-dropdown-width': `${store.dropdown.anchorRect.width}px` }
  : {});
</script>
<template>
  <div v-if="show" class="specorator-slash-dropdown specorator-slash-dropdown-fixed visible" :style="style">
    <DropdownList
      :items="store.dropdown.items" :active-index="store.dropdown.activeIndex"
      root-class="specorator-slash-list" item-class="specorator-slash-item"
      empty-class="specorator-slash-empty" empty-text="No matching commands"
      @select="(i) => cb?.onDropdownSelect(i)"
    />
  </div>
</template>
```

Write `MentionDropdown.vue` (kind `'mention'`, classes `specorator-mention-dropdown`/`specorator-mention-item`/`specorator-mention-empty`, fixed class `specorator-mention-dropdown-fixed`) and `ResumeSessionDropdown.vue` (kind `'resume'`, classes `specorator-resume-dropdown`/`specorator-resume-item`/`specorator-resume-empty`, header `specorator-resume-header`, no fixed positioning — CSS-flow dropup) with the same structure. Match each root/child class + the `.visible` toggle to the existing CSS in `src/style/features/slash-commands.css` / mention / `resume-session.css`.

- [ ] **Step 3: Render the three inside `ComposerTextarea` region** — add them as siblings after the `<textarea>` in `ComposerTextarea.vue` (they are caret-anchored overlays inside the composer). Keyboard navigation still flows through `tabInputWiring`'s existing `keydownHandler` (which calls the detectors' `handleKeydown`); those now call the coordinator's `move`/`selectActive`/`hide` which the store projects — so ArrowUp/Down/Enter/Escape update `activeIndex` reactively and the Vue list re-highlights. No new keyboard listeners in the components (avoids double-handling).

- [ ] **Step 4: Test + commit** — mount each over a stub `store.dropdown`; assert render only when kind matches, active item carries `.selected`, mousedown-select fires `onDropdownSelect(i)`, anchor style vars set. Commit.

```bash
git add -A && git commit -m "$(cat <<'EOF'
feat(chat): render composer slash/mention/resume dropdowns in Vue

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014VDsSXWHRqZr2EcNgDX2eq
EOF
)"
```

### Task 17: Delete the imperative chat dropdown DOM render; keep the shared component for inline-edit

**Files:** Modify `SlashCommandDropdown.ts` / `MentionDropdownController.ts` / `ResumeSessionDropdown.ts` (chat render paths + delegate `handleKeydown`/`isVisible`/`setEnabled` to the coordinator), `tabUi.ts`, `tabInputWiring.ts`; Test `tests/vue/chat/composer/dropdownKeyboard.test.ts`.

- [ ] **Step 1** — In the CHAT usage of the dropdowns, delete the imperative DOM render (the `.specorator-*-dropdown` creation + `render`/`updateSelection` DOM) now that the coordinator + Vue own rendering; keep detection/insert. `shared/components/SlashCommandDropdown.ts` MUST remain fully functional for `InlineEditModal` (it constructs into `document.body`) — do not delete it; if chat and inline-edit shared one class, split the render out so inline-edit keeps DOM render and chat uses the coordinator. Confirm `InlineEditModal` still opens its slash dropdown.

- [ ] **Step 2: Keep the keyboard bridge intact (the round-6 critical wiring)** — `tabInputWiring.ts` and `NavigationController` are UNCHANGED in shape but call objects that are being replaced, so those objects must keep pointing at the coordinator bridge:
  - `ui.slashCommandDropdown` stays a live object whose `handleKeydown(e)` / `isVisible()` / `setEnabled(b)` DELEGATE to `tab.controllers.composerDropdownCoordinator` (slash + resume kinds). `tabInputWiring`'s `keydownHandler` still calls `ui.slashCommandDropdown?.handleKeydown(e)` and `ui.slashCommandDropdown?.setEnabled(!isActive)` (bang-bash suppression) — now routed to the bridge.
  - `ui.fileContextManager.handleMentionKeydown(e)` / `isMentionDropdownVisible()` / `hideMentionDropdown()` DELEGATE to the coordinator's bridge for the `mention` kind (detection stays in `FileContextManager`).
  - `NavigationController.shouldSkipEscapeHandling()` calls `ui.slashCommandDropdown?.isVisible()` and `ui.fileContextManager?.isMentionDropdownVisible()` — both now reflect coordinator state, so Escape is captured by the dropdown (dismiss) BEFORE the nav controller (blur), exactly as today.
  - The Vue dropdown components add **NO keyboard listeners** — all keys flow through `tabInputWiring` → the bridge → the store. The Mod+Enter explicit-send short-circuit stays ordered BEFORE the dropdown handlers.

- [ ] **Step 3: Keyboard-routing parity test + commit** — `dropdownKeyboard.test.ts`: mount the composer, drive the engine trigger by typing `/` into the textarea (fire the `input` handler) → `store.dropdown.kind === 'slash'` with items; dispatch `keydown` ArrowDown on the textarea → `store.dropdown.activeIndex` increments AND `coordinator.handleKeydown` returned true; Enter → the active command inserts into `tab.dom.inputEl.value` and the dropdown closes AND `inputController.sendMessage` was NOT called (Enter selected, did not send); Escape → `store.dropdown.kind === null` AND `document.activeElement === tab.dom.inputEl` (dismiss did not blur). Assert `NavigationController.shouldSkipEscapeHandling()` returns true while the dropdown is visible. Confirm `check:quality` shows no new clone group (shared item-builders reused). Commit.

```bash
git add -A && git commit -m "$(cat <<'EOF'
refactor(chat): drop imperative chat dropdown DOM; keep shared component for inline-edit

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014VDsSXWHRqZr2EcNgDX2eq
EOF
)"
```

**Phase 5 complete.** All three dropdowns render in Vue; the engine keeps trigger-detection; `shared/components/SlashCommandDropdown.ts` remains for inline-edit.

# Phase 6 — Delete remnants, re-lock ratchets, DOM-contract backstop, docs

### Task 18: Final deletion sweep + confirm `buildTabDOM` is state-only

**Files:** Modify `tabFactory.ts`, `tabUi.ts`, `types.ts`; delete any remaining imperative composer files; grep-confirm.

- [ ] **Step 1** — Grep for leftover imperative composer DOM assembly and delete/confirm:

```bash
rg -n "specorator-input-container|specorator-input-wrapper|createInputToolbar|new FileChipsView|new EditedFilesView|EditedFilesView|dom.inputWrapper.createDiv|toolbarHostEl|editedFilesRowEl" src/features/chat
```

Expected remaining references: only the Vue SFCs (rendering the classes), `tab.dom.inputWrapper`/`inputContainerEl`/`contextRowEl`/`inputEl`/`navRowEl`/`queueIndicatorEl` reads by the out-of-scope controllers (ChatDropController, SelectionController, InlinePromptController, tabInputWiring, resolveNavRowEl), and the projection. Delete any orphaned imperative view files: `src/features/chat/ui/InputToolbar.ts`, `src/features/chat/ui/toolbar/*` (DOM widgets), `src/features/chat/ui/EditedFilesView.ts`, `src/features/chat/ui/file-context/view/FileChipsView.ts`, and the image-preview DOM builder in `ImageContext.ts` — if any survived earlier phases.

- [ ] **Step 2** — `buildTabDOM` is now state-only for the composer: it creates `contentEl`, `messagesWrapperEl`, `statusPanelContainerEl`, `composerHostEl`, and the placeholder `inputEl`. Remove the `toolbarHostEl` and `editedFilesRowEl` placeholder fields from `TabDOMElements` if their handles were removed in Phases 2/3 (keep `contextRowEl`, `inputContainerEl`, `inputWrapper`, `navRowEl`, `queueIndicatorEl`, `inputEl`, `selectionIndicatorEl`, `browserIndicatorEl`, `canvasIndicatorEl` — all still read by out-of-scope consumers, set on mount). Update the `TabDOMElements` interface + `buildTabDOM` return accordingly.

- [ ] **Step 3** — Full green bar; commit.

```bash
git add -A && git commit -m "$(cat <<'EOF'
refactor(chat): delete remaining imperative composer DOM assembly

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014VDsSXWHRqZr2EcNgDX2eq
EOF
)"
```

### Task 19: Re-lock the LOC + quality ratchets (expect net shrink)

**Files:** Modify `scripts/loc-baseline.json`, `scripts/quality-baseline.json` (only if improved).

- [ ] **Step 1** — Run the guards to see current numbers:

```bash
npm run check:loc
npm run check:quality
```

Expected: `check:loc` reports the composer directories net-SHRANK (imperative widgets deleted > Vue components added) — the guard fails ONLY if LOC grew; a shrink requires re-locking the baseline DOWN.

- [ ] **Step 2** — Re-lock `scripts/loc-baseline.json` to the new (lower) numbers per the ratchet procedure in `docs/build-ci/quality-gates.md`. If `check:quality` improved (dead-code/dupes dropped), re-lock `scripts/quality-baseline.json` too — same PR, per the clean-code ratchet rule (`docs/build-ci/clean-code-refactoring.md`). Do NOT bump any baseline UP; if a metric regressed (e.g. a dropdown clone group), FIX by extraction, then re-lock down.

- [ ] **Step 3** — Run `npm run check:css` (no new `!important`; the composer reuses existing stylesheets). Commit.

```bash
git add scripts/loc-baseline.json scripts/quality-baseline.json && git commit -m "$(cat <<'EOF'
chore(chat): re-lock LOC + quality ratchets after composer Vue migration

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014VDsSXWHRqZr2EcNgDX2eq
EOF
)"
```

### Task 20: `composerDomContract.test.ts` — the cross-surface DOM lock

**Files:** Create `tests/vue/chat/composer/composerDomContract.test.ts`; Modify `src/features/chat/CLAUDE.md`, `docs/adr/0005-chat-shell-vue-migration.md`.

- [ ] **Step 1: Write the DOM-contract test** — mount the real composer island (`mountTabComposer`) over a tab whose projection produces a full toolbar slice + chips + images + edited files, then assert EVERY class/element out-of-scope consumers read, plus the element-handle registrations, plus the three engine-driven drives (queue row, selection indicators, chips visible-flex + `has-content`).

`tests/vue/chat/composer/composerDomContract.test.ts` (structure):

```ts
import '@/providers';
import { flushPromises } from '@vue/test-utils';
import { App, Component } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mountTabComposer } from '@/features/chat/tabs/tabComposerMount';
import { updateContextRowHasContent } from '@/features/chat/controllers/contextRowVisibility';
import { QueuedMessageController } from '@/features/chat/controllers/QueuedMessageController';
// makeTab/makePlugin from the shared _kit; the tab's projection returns a rich
// snapshot (all nine toolbar widgets visible, ≥1 file chip, ≥1 image, ≥1 edited file).

function expectAllPresent(root: HTMLElement, selectors: string[]): void {
  const missing = selectors.filter((s) => root.querySelector(s) === null);
  expect(missing, `missing composer DOM-contract selectors: ${missing.join(', ')}`).toEqual([]);
}

describe('composer DOM contract', () => {
  beforeEach(() => vi.clearAllMocks());

  it('emits every consumer-critical class + registers every element handle', async () => {
    const tab = /* makeTab with a rich projection */ null as unknown as import('@/features/chat/tabs/types').TabData;
    mountTabComposer(tab, /* plugin */ new App() as never, new Component());
    await flushPromises();
    const container = tab.dom.composerHostEl;

    expectAllPresent(container, [
      // Structural (ChatDropController / InlinePromptController / resolveNavRowEl / tabInputWiring).
      '.specorator-input-container',
      '.specorator-input-nav-row',
      '.specorator-input-wrapper',
      '.specorator-context-row',
      '.specorator-input-queue-row',
      '.specorator-input-toolbar',
      'textarea.specorator-input',
      // Toolbar widgets.
      '.specorator-model-selector', '.specorator-mode-selector', '.specorator-thinking-selector',
      '.specorator-service-tier-toggle', '.specorator-permission-toggle', '.specorator-plan-mode-toggle',
      '.specorator-mcp-selector', '.specorator-external-context-selector', '.specorator-context-meter',
      // Chips + indicators + edited files (rich projection includes a current note).
      '.specorator-file-indicator', '.specorator-file-chip', '.specorator-file-chip--current',
      '.specorator-image-preview', '.specorator-image-chip',
      '.specorator-selection-indicator', '.specorator-browser-selection-indicator', '.specorator-canvas-indicator',
      '.specorator-edited-files-row', '.specorator-edited-files-badge',
    ]);

    // Element-handle registration to tab.dom.* (+ ChatState for the queue row).
    expect(tab.dom.inputContainerEl).toBe(container.querySelector('.specorator-input-container'));
    expect(tab.dom.navRowEl).toBe(container.querySelector('.specorator-input-nav-row'));
    expect(tab.dom.inputWrapper).toBe(container.querySelector('.specorator-input-wrapper'));
    expect(tab.dom.contextRowEl).toBe(container.querySelector('.specorator-context-row'));
    expect(tab.dom.inputEl).toBe(container.querySelector('textarea.specorator-input'));
    const queueRow = container.querySelector('.specorator-input-queue-row');
    expect(tab.dom.queueIndicatorEl).toBe(queueRow);
    expect(tab.state.queueIndicatorEl).toBe(queueRow);
    expect(tab.dom.selectionIndicatorEl).toBe(container.querySelector('.specorator-selection-indicator'));
    expect(tab.dom.browserIndicatorEl).toBe(container.querySelector('.specorator-browser-selection-indicator'));
    expect(tab.dom.canvasIndicatorEl).toBe(container.querySelector('.specorator-canvas-indicator'));

    tab.mountedComposer!.unmount();
  });

  it('QueuedMessageController drives the Vue-rendered queue row', async () => {
    const tab = /* makeTab */ null as unknown as import('@/features/chat/tabs/types').TabData;
    mountTabComposer(tab, new App() as never, new Component());
    await flushPromises();
    tab.state.queuedMessage = { content: 'follow up', /* ... */ } as never;
    const controller = new QueuedMessageController({ state: tab.state, /* deps */ } as never);
    controller.updateQueueIndicator();
    const row = tab.dom.queueIndicatorEl;
    expect(row.querySelector('.specorator-queue-indicator-text')).not.toBeNull();
    expect(row.classList.contains('specorator-visible-flex')).toBe(true);
    tab.mountedComposer!.unmount();
  });

  it('a selection controller can still mutate its Vue-hosted indicator', async () => {
    const tab = /* makeTab */ null as unknown as import('@/features/chat/tabs/types').TabData;
    mountTabComposer(tab, new App() as never, new Component());
    await flushPromises();
    const indicator = tab.dom.selectionIndicatorEl!;
    // Mirror SelectionController.updateIndicator: set text + remove hidden.
    indicator.textContent = '3 line(s) selected';
    indicator.removeClass('specorator-hidden');
    expect(indicator.textContent).toBe('3 line(s) selected');
    expect(indicator.classList.contains('specorator-hidden')).toBe(false);
    tab.mountedComposer!.unmount();
  });

  it('populated chips carry .specorator-visible-flex and updateContextRowHasContent sets .has-content', async () => {
    const tab = /* makeTab with ≥1 file chip + ≥1 image */ null as unknown as import('@/features/chat/tabs/types').TabData;
    mountTabComposer(tab, new App() as never, new Component());
    await flushPromises();
    expect(tab.dom.contextRowEl.querySelector('.specorator-file-indicator')!.classList.contains('specorator-visible-flex')).toBe(true);
    expect(tab.dom.contextRowEl.querySelector('.specorator-image-preview')!.classList.contains('specorator-visible-flex')).toBe(true);
    updateContextRowHasContent(tab.dom.contextRowEl);
    expect(tab.dom.contextRowEl.classList.contains('has-content')).toBe(true);
    tab.mountedComposer!.unmount();
  });

  it('wrapper-mode classes are Vue-owned and survive an engine re-projection', async () => {
    // Projection reports wrapperMode { planMode:true, instructionMode:true,
    // bangBashMode:false }. A later emit (any engine change) re-patches the island;
    // the classes MUST persist — Vue owns them, no imperative classList.toggle
    // remains (Task 4/5b). This is the round-5 regression guard.
    const tab = /* makeTab: projection wrapperMode plan+instruction true */ null as unknown as import('@/features/chat/tabs/types').TabData;
    mountTabComposer(tab, new App() as never, new Component());
    await flushPromises();
    const wrapper = tab.dom.inputWrapper;
    expect(wrapper.classList.contains('specorator-input-plan-mode')).toBe(true);
    expect(wrapper.classList.contains('specorator-input-instruction-mode')).toBe(true);
    tab.composer!.emit();
    await flushPromises();
    expect(wrapper.classList.contains('specorator-input-plan-mode')).toBe(true);
    expect(wrapper.classList.contains('specorator-input-instruction-mode')).toBe(true);
    tab.mountedComposer!.unmount();
  });

  // Interactive parity — current-note removal clearing currentNotePath, onOpenFile,
  // onToggleMcpServer toggling, and the edited-files row opening — is covered by the
  // per-component tests (Tasks 9, 12, 13). This DOM-contract suite locks only the
  // cross-surface classes + element handles + the engine-driven-host drives above.
});
```

The authoritative selector list lives in this test — keep it in sync with any future composer class change. This is the regression backstop until the side-panels sub-project migrates the remaining consumers.

- [ ] **Step 2: Update `src/features/chat/CLAUDE.md`** — add a "Composer Vue Island" section mirroring the "Transcript Vue Island" section: mount (`mountComposer` / `mountTabComposer`, fresh per-leaf Pinia), store (`useComposerStore` slices — note the `wrapperMode` group owns the three `.specorator-input-*-mode` wrapper classes, and `chips.currentNote` is projected + removed separately from `files`), projection (`TabComposerProjection` emit points), callbacks (`ComposerCallbacks` + element-handle keys; the unified `onRemoveChip(key, kind)`), the engine-driven hosts (the textarea — Vue renders it, engine owns `.value`/caret/IME AND `placeholder`; queue row via `QueuedMessageController`; the three selection indicators — untouched controllers), the `.specorator-*` DOM contract + `composerDomContract.test.ts`, and the shared-dropdown note (inline-edit keeps `shared/components/SlashCommandDropdown.ts`). Update the top-of-file "Still-imperative" line to list ONLY the side panels (status panel, navigation sidebar). Remove "composer + input toolbar" from every still-imperative mention.

- [ ] **Step 3: Update `docs/adr/0005-chat-shell-vue-migration.md`** — add a "Sub-project 3 — Composer" note recording: the per-component cutover approach (Approach A), the structural-shell-first + engine-driven-host seam, the textarea hard cutover, the selection-indicator/queue-row engine-driven hosts, the deleted imperative widgets, and the remaining side-panels sub-project. Mirror the sub-project 1/2 entries' style.

- [ ] **Step 4: Full green bar (all lanes) + commit**

```bash
npm run typecheck && npm run typecheck:vue && npm run lint && npm run test:vue && npm run test -- --selectProjects unit && npm run build && npm run check:loc && npm run check:css && npm run check:quality
git add tests/vue/chat/composer/composerDomContract.test.ts src/features/chat/CLAUDE.md docs/adr/0005-chat-shell-vue-migration.md
git commit -m "$(cat <<'EOF'
test(chat): lock the composer DOM contract; document sub-project 3

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014VDsSXWHRqZr2EcNgDX2eq
EOF
)"
```

**Phase 6 complete — migration done.** The composer renders through a Vue 3 + Pinia island with strict behavior parity; `ui/toolbar/*`, `InputToolbar.ts`, the `FileContext`/`ImageContext` view layers, `EditedFilesView`, and the composer's imperative DOM assembly are deleted or reduced to state-only; `InputController`, `tabInputWiring`, every controller, `ChatState`, and the provider/runtime boundary are unchanged; the primary chat interaction loop (input → transcript) is fully Vue. The only remaining imperative chat surface is the side panels (the next sub-project).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-16-composer-vue-migration.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration (REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`).
2. **Inline Execution** — execute tasks in this session with batch checkpoints (REQUIRED SUB-SKILL: `superpowers:executing-plans`).
