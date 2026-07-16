import type {
  ComposerChips,
  ComposerDraftMeta,
  ComposerDropdownState,
  ComposerEditedFile,
  ComposerInputMode,
  ComposerStreamingState,
  ComposerToolbarState,
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
