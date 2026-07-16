import { getEnabledProviderForModel } from '../../../core/providers/modelRouting';
import type { ProviderId } from '../../../core/providers/types';
import type { Conversation } from '../../../core/types';
import { asSettingsBag } from '../../../core/types/settings';
import type SpecoratorPlugin from '../../../main';
import { SubagentManager } from '../services/SubagentManager';
import { ChatState } from '../state/ChatState';
import { resolveBlankTabDefaultProviderId } from './tabModelPolicy';
import { resolveBlankTabModel } from './tabShared';
import type { TabData, TabDOMElements, TabId, TabKind } from './types';
import { generateTabId } from './types';

export interface TabCreateOptions {
  plugin: SpecoratorPlugin;

  containerEl: HTMLElement;
  conversation?: Conversation;
  tabId?: TabId;
  /** Restored draft model for blank tabs. */
  draftModel?: string | null;
  /**
   * Tab-pinned model that survives runtime init. Used for Agent Board task
   * runs so the work-order model:
   *   - displays in the ModelSelector for the life of the tab,
   *   - is forwarded as `queryOptions.model` on every turn.
   */
  pinnedModel?: string | null;
  /**
   * Display-only initial model for a bound-agent tab (seeds the ModelSelector
   * without forcing a query override — see `TabData.displayModel`).
   */
  displayModel?: string | null;
  /** Provider to inherit for blank tabs (e.g. from the active tab). */
  defaultProviderId?: ProviderId;
  /** Immutable tab kind. Defaults to 'chat' when omitted. */
  kind?: TabKind;
  onStreamingChanged?: (isStreaming: boolean) => void;
  onTitleChanged?: (title: string) => void;
  onAttentionChanged?: (needsAttention: boolean) => void;
  onConversationIdChanged?: (conversationId: string | null) => void;
}

/**
 * Creates a new Tab instance with all required state.
 */
export function createTab(options: TabCreateOptions): TabData {
  const {
    plugin,
    containerEl,
    conversation,
    tabId,
    onStreamingChanged,
    onAttentionChanged,
    onConversationIdChanged,
  } = options;

  const id = tabId ?? generateTabId();

  const contentEl = containerEl.createDiv({ cls: 'specorator-tab-content specorator-hidden' });

  const state = new ChatState({
    onStreamingStateChanged: onStreamingChanged,
    onAttentionChanged: onAttentionChanged,
    onConversationChanged: onConversationIdChanged,
  });

  // Create subagent manager with no-op callback.
  // This placeholder is replaced in initializeTabControllers() with the actual
  // callback that updates the StreamController. We defer the real callback
  // because StreamController doesn't exist until controllers are initialized.
  const subagentManager = new SubagentManager(plugin.app, () => {});

  const dom = buildTabDOM(contentEl);
  state.queueIndicatorEl = dom.queueIndicatorEl;

  const isBound = !!conversation?.id;
  const restoredDraftModel = typeof options.draftModel === 'string'
    ? options.draftModel.trim()
    : '';
  const draftModel = isBound
    ? null
    : (restoredDraftModel || resolveBlankTabModel(plugin, options.defaultProviderId));
  const initialProviderId = conversation?.providerId
    ?? (draftModel
      ? getEnabledProviderForModel(draftModel, plugin.settings)
      : resolveBlankTabDefaultProviderId(asSettingsBag(plugin.settings)));

  const pinnedModelInput = typeof options.pinnedModel === 'string'
    ? options.pinnedModel.trim()
    : '';
  const pinnedModel = pinnedModelInput || null;

  const displayModelInput = typeof options.displayModel === 'string'
    ? options.displayModel.trim()
    : '';
  const displayModel = displayModelInput
    ? { conversationId: conversation?.id ?? null, model: displayModelInput }
    : null;

  const tab: TabData = {
    id,
    kind: options.kind ?? 'chat',
    lifecycleState: isBound ? 'bound_cold' : 'blank',
    draftModel,
    pinnedModel,
    displayModel,
    providerId: initialProviderId,
    conversationId: conversation?.id ?? null,
    service: null,
    serviceInitialized: false,
    state,
    controllers: {
      selectionController: null,
      browserSelectionController: null,
      canvasSelectionController: null,
      conversationController: null,
      streamController: null,
      inputController: null,
      navigationController: null,
    },
    services: {
      subagentManager,
      instructionRefineService: null,
      titleGenerationService: null,
    },
    ui: {
      fileContextManager: null,
      imageContextManager: null,
      externalContextSelector: null,
      mcpServerSelector: null,
      slashCommandDropdown: null,
      instructionModeManager: null,
      bangBashModeManager: null,
      statusPanel: null,
      navigationSidebar: null,
    },
    dom,
    transcript: null,
    mountedTranscript: null,
    composer: null,
    mountedComposer: null,
  };

  return tab;
}

/**
 * Builds the DOM structure for a tab.
 */
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

  // Detached placeholder overwritten by registerInputEl on mount, before any
  // consumer reads it. ComposerTextarea.vue renders the real `<textarea>` (with
  // its class/dir/rows/placeholder) and hands the raw node back; this bare node
  // only satisfies the non-null `HTMLTextAreaElement` type between `createTab`
  // and mount, and is GC'd once the register repoints `tab.dom.inputEl`.
  const inputEl = contentEl.ownerDocument.createElement('textarea');

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
    contextRowEl: composerHostEl,
    selectionIndicatorEl: null,
    browserIndicatorEl: null,
    canvasIndicatorEl: null,
    eventCleanups: [],
  };
}
