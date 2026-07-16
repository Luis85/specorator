import type SpecoratorPlugin from '../../../main';
import type { ComposerSnapshot, ComposerSubscribe } from '../ui/vue/composer/composerCallbacks';
import type {
  ComposerChips,
  ComposerDraftMeta,
  ComposerDropdownState,
  ComposerEditedFile,
  ComposerInputMode,
  ComposerStreamingState,
  ComposerToolbarState,
  ComposerWrapperMode,
} from '../ui/vue/composer/stores/composerStore';
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
