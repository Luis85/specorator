import type {
  ComposerChips,
  ComposerDropdownState,
  ComposerEditedFile,
  ComposerToolbarState,
  ComposerWrapperMode,
} from './stores/composerStore';

/** One projected snapshot the projection pushes on every composer-relevant
 *  engine change (settings, chips, mode, dropdown, edited files).
 *  Carries the whole read-model so every store field flows through the single
 *  `subscribe` channel — the engine has no direct handle to the store. */
export interface ComposerSnapshot {
  toolbar: ComposerToolbarState;
  chips: ComposerChips;
  editedFiles: ComposerEditedFile[];
  dropdown: ComposerDropdownState;
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

  // Toolbar action delegators (Phase 2). Thin wrappers over the imperative
  // toolbar action callbacks; truth + I/O stay in the engine widgets, and each
  // delegator re-projects via `tab.composer?.emit()`. External-context mutations
  // re-project async through the selector's `onChange`, never synchronously here.
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

  // Chip removal + open (Phase 3). `onRemoveChip` `key` is a vault path for
  // 'current'/'file'/'folder', the image id for 'image'. Removing 'current'
  // clears the tracked current-note path so `shouldSendCurrentNote()` stops
  // re-attaching it next turn.
  onRemoveChip: (key: string, kind: 'current' | 'file' | 'folder' | 'image') => void;
  /** Open the full-size preview for an image chip (by attachment id) — mirrors the
   *  imperative thumbnail click → showFullImage → openImageModal. */
  onOpenImage: (id: string) => void;
  /** Open a current/file chip's path in a new tab (folders are non-openable). */
  onOpenFile: (path: string) => void;
  /** Open an agent-edited file — RE-RESOLVES the created/edited path at click
   *  time (a file deleted after listing surfaces a Notice). */
  onOpenEditedFile: (path: string) => void;

  // Dropdown navigation (Phase 5). The Vue dropdown render (later task) drives
  // these; they delegate to the chat dropdown coordinator, which owns the active
  // `{ kind, items, activeIndex, anchorRect }` and re-projects on each mutation.
  /** Arrow navigation: move the highlighted item by `direction` (+1 down / -1 up). */
  onDropdownNavigate: (direction: 1 | -1) => void;
  /** Commit the item at `index` (hover-to-index then select). */
  onDropdownSelect: (index: number) => void;
  /** Dismiss the active dropdown. */
  onDropdownDismiss: () => void;

  // Element-handle registration (Vue owns the node; the engine keeps the handle).
  registerInputContainer: (el: HTMLElement) => void;
  registerNavRow: (el: HTMLElement) => void;
  registerInputWrapper: (el: HTMLElement) => void;
  registerContextRow: (el: HTMLElement) => void;
  registerQueueRow: (el: HTMLElement) => void;
  /** Vue renders the `<textarea>` (ComposerTextarea.vue) and hands the raw node
   *  back; the engine owns its `.value`/caret/IME/placeholder/height forever
   *  after — Vue never touches it again (no v-model, no reactive attrs). */
  registerInputEl: (el: HTMLTextAreaElement) => void;
  // Selection-indicator hosts (Phase 3). Vue renders the three engine-driven
  // <div>s (SelectionIndicators.vue); the engine keeps the raw nodes so the
  // out-of-scope selection controllers mutate them directly.
  registerSelectionIndicator: (el: HTMLElement) => void;
  registerBrowserIndicator: (el: HTMLElement) => void;
  registerCanvasIndicator: (el: HTMLElement) => void;
}
// NOTE: there are no `onSend`/`onCancel` delegators — send is keyboard-only
// (Enter / Mod+Enter via tabInputWiring); no send button exists. Streaming is
// cancelled by Escape (tabInputWiring), unchanged.
