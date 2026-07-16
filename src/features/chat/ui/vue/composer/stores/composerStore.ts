import { defineStore } from 'pinia';
import { shallowRef } from 'vue';

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
/** Reasoning controls. EXACTLY ONE of `budget`/`effort` is non-null (never both) —
 *  both are fed by `getReasoningOptions`, and `isAdaptiveReasoningModel` decides
 *  which: adaptive models render the `effort` gears (select → `onSetEffortLevel`
 *  → `effortLevel`), non-adaptive render the `budget` gears (select →
 *  `onSetThinkingBudget` → `thinkingBudget`). There is no `getEffortOptions`. A
 *  `reasoning` of `null` on the toolbar hides the widget entirely (reasoningControl
 *  'none' / empty options / lone-default). */
export interface ComposerReasoningState {
  budget: ComposerReasoningControl | null;
  effort: ComposerReasoningControl | null;
}

export interface ComposerServiceTierState { active: boolean; activeValue: string; inactiveValue: string; }

export interface ComposerPermissionState {
  visible: boolean; label: string; active: boolean; planActive: boolean; switchVisible: boolean;
  activeValue: string; inactiveValue: string;
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
// removing it nulls the `FileContextManager.currentNotePath` field (FileContext.ts)
// and detaches the note from state so `shouldSendCurrentNote()` stops sending it.
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
