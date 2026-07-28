import type { Component } from 'obsidian';
import { Notice } from 'obsidian';

import { ProviderRegistry } from '../../../core/providers/ProviderRegistry';
import type { ProviderId } from '../../../core/providers/types';
import type { ChatMessage } from '../../../core/types';
import { t } from '../../../i18n/i18n';
import type SpecoratorPlugin from '../../../main';
import { openSpecoratorProviderSettings } from '../../../utils/obsidianPrivateApi';
import { isTeamChatSurfaceConversation } from '../controllers/teamChatSurface';
import { eligibleMessageActions } from '../rendering/messageActions';
import { findRewindContext } from '../rewind';
import { mountTranscript } from '../ui/vue/transcript/mountTranscript';
import type { TranscriptCallbacks } from '../ui/vue/transcript/transcriptCallbacks';
import { resolveImageAttachmentSrc, showFullImageAttachment } from '../utils/imageAttachment';
import { getTabProviderId } from './providerResolution';
import {
  buildTabConversationController,
  buildTabInputController,
  buildTabNavigationController,
  buildTabSelectionControllers,
  buildTabStreamController,
} from './tabControllerSetup';
import { getTabCapabilities, type ProviderCatalogInfo } from './tabShared';
import { TabTranscriptProjection } from './tabTranscript';
import type { TabData } from './types';

export interface ForkContext {
  messages: ChatMessage[];
  providerId?: ProviderId;
  sourceSessionId: string;
  sourceProviderState?: Record<string, unknown>;
  resumeAt: string;
  sourceTitle?: string;
  /** 1-based index used for fork title suffix (counts only non-interrupt user messages). */
  forkAtUserMessage?: number;
  currentNote?: string;
}

function deepCloneMessages(messages: ChatMessage[]): ChatMessage[] {
  if (typeof structuredClone === 'function') {
    return structuredClone(messages);
  }
  return JSON.parse(JSON.stringify(messages)) as ChatMessage[];
}

function countUserMessagesForForkTitle(messages: ChatMessage[]): number {
  // Keep fork numbering stable by excluding non-semantic user messages.
  return messages.filter(m => m.role === 'user' && !m.isInterrupt && !m.isRebuiltContext).length;
}

interface ForkSource {
  providerId?: ProviderId;
  sourceSessionId: string;
  sourceProviderState?: Record<string, unknown>;
  sourceTitle?: string;
  currentNote?: string;
}

/**
 * Resolves session ID and conversation metadata needed for forking.
 * Prefers the live service session ID; falls back to persisted conversation metadata.
 * Shows a notice and returns null when no session can be resolved.
 */
function resolveForkSource(tab: TabData, plugin: SpecoratorPlugin): ForkSource | null {
  const conversation = tab.conversationId
    ? plugin.getConversationSync(tab.conversationId)
    : null;

  // Delegate session ID resolution to the runtime when available;
  // fall back to persisted conversation metadata when no runtime is active.
  const sourceSessionId = tab.service
    ? tab.service.resolveSessionIdForFork(conversation ?? null)
    : ProviderRegistry
      .getConversationHistoryService(conversation?.providerId ?? tab.providerId)
      .resolveSessionIdForConversation(conversation);

  if (!sourceSessionId) {
    new Notice(t('chat.fork.failed', { error: t('chat.fork.errorNoSession') }));
    return null;
  }

  return {
    providerId: getTabProviderId(tab, plugin, conversation),
    sourceSessionId,
    sourceProviderState: conversation?.providerState,
    sourceTitle: conversation?.title,
    currentNote: conversation?.currentNote,
  };
}

/**
 * Builds the fork request payload from a resolved source plus the per-call
 * checkpoint fields (the only parts that differ between single-message and
 * fork-all). Keeps the shared `source.*` mapping in one place.
 */
function buildForkContext(
  source: ForkSource,
  checkpoint: { messages: ChatMessage[]; resumeAt: string; forkAtUserMessage: number },
): ForkContext {
  return {
    messages: checkpoint.messages,
    providerId: source.providerId,
    sourceSessionId: source.sourceSessionId,
    sourceProviderState: source.sourceProviderState,
    resumeAt: checkpoint.resumeAt,
    sourceTitle: source.sourceTitle,
    forkAtUserMessage: checkpoint.forkAtUserMessage,
    currentNote: source.currentNote,
  };
}

/**
 * Shared fork guard: fork must be supported and the tab must not be streaming.
 * Surfaces the matching notice and returns false when forking can't proceed.
 */
function canFork(tab: TabData, plugin: SpecoratorPlugin): boolean {
  // A Team Chat DM is one fixed thread per agent, so forking (an unbound ad-hoc
  // conversation that escapes the surface filter and desyncs the room map) is
  // disabled — this closes the `/fork` COMMAND path (handleForkAll), the message
  // fork button already being hidden via the transcript's `isForkEligible`.
  if (isTeamChatSurfaceConversation(plugin, tab.conversationId)) {
    new Notice(t('teamChat.actionUnavailableInDm'));
    return false;
  }
  if (!getTabCapabilities(tab, plugin).supportsFork) {
    new Notice(t('chat.fork.unsupportedProvider'));
    return false;
  }

  if (tab.state.isStreaming) {
    new Notice(t('chat.fork.unavailableStreaming'));
    return false;
  }

  return true;
}

async function handleForkRequest(
  tab: TabData,
  plugin: SpecoratorPlugin,
  userMessageId: string,
  forkRequestCallback: (forkContext: ForkContext) => Promise<void>,
): Promise<void> {
  const { state } = tab;

  if (!canFork(tab, plugin)) return;

  const msgs = state.messages;
  const userIdx = msgs.findIndex(m => m.id === userMessageId);
  if (userIdx === -1) {
    new Notice(t('chat.fork.failed', { error: t('chat.fork.errorMessageNotFound') }));
    return;
  }

  if (!msgs[userIdx].userMessageId) {
    new Notice(t('chat.fork.unavailableNoUuid'));
    return;
  }

  const rewindCtx = findRewindContext(msgs, userIdx);
  if (!rewindCtx.hasResponse || !rewindCtx.prevAssistantUuid) {
    new Notice(t('chat.fork.unavailableNoResponse'));
    return;
  }

  const source = resolveForkSource(tab, plugin);
  if (!source) return;

  await forkRequestCallback(buildForkContext(source, {
    messages: deepCloneMessages(msgs.slice(0, userIdx)),
    resumeAt: rewindCtx.prevAssistantUuid,
    forkAtUserMessage: countUserMessagesForForkTitle(msgs.slice(0, userIdx + 1)),
  }));
}

async function handleForkAll(
  tab: TabData,
  plugin: SpecoratorPlugin,
  forkRequestCallback: (forkContext: ForkContext) => Promise<void>,
): Promise<void> {
  const { state } = tab;

  if (!canFork(tab, plugin)) return;

  const msgs = state.messages;
  if (msgs.length === 0) {
    new Notice(t('chat.fork.commandNoMessages'));
    return;
  }

  let lastAssistantUuid: string | undefined;
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === 'assistant' && msgs[i].assistantMessageId) {
      lastAssistantUuid = msgs[i].assistantMessageId;
      break;
    }
  }

  if (!lastAssistantUuid) {
    new Notice(t('chat.fork.commandNoAssistantUuid'));
    return;
  }

  const source = resolveForkSource(tab, plugin);
  if (!source) return;

  await forkRequestCallback(buildForkContext(source, {
    messages: deepCloneMessages(msgs),
    resumeAt: lastAssistantUuid,
    forkAtUserMessage: countUserMessagesForForkTitle(msgs) + 1,
  }));
}

export function initializeTabControllers(
  tab: TabData,
  plugin: SpecoratorPlugin,
  component: Component,
  forkRequestCallback?: (forkContext: ForkContext) => Promise<void>,
  openConversation?: (conversationId: string) => Promise<void>,
  getProviderCatalogConfig?: () => ProviderCatalogInfo,
): void {
  // Pre-bind the fork affordances here so the setup builders never import the
  // fork handlers from this module (that would form an import cycle).
  const forkMessageCallback = forkRequestCallback
    ? (userMessageId: string) => handleForkRequest(tab, plugin, userMessageId, forkRequestCallback)
    : undefined;
  const forkAllCallback = forkRequestCallback
    ? () => handleForkAll(tab, plugin, forkRequestCallback)
    : undefined;

  // Per-tab transcript projection source, created first so the controllers'
  // `emitTranscript` closures resolve it. Wire it into `onMessagesChanged`
  // (preserving the existing streaming/attention/conversation callbacks) so
  // add/remove/set message mutations re-project; in-place block/tool growth is
  // re-projected explicitly by StreamController/InputController.
  tab.transcript = new TabTranscriptProjection(tab.state);
  tab.state.callbacks = {
    ...tab.state.callbacks,
    onMessagesChanged: () => tab.transcript?.emit(),
  };

  // Fixed construction order: later builders read controllers constructed by
  // earlier ones, so these calls are not independently reorderable.
  buildTabSelectionControllers(tab, plugin);
  buildTabStreamController(tab, plugin);
  buildTabConversationController(tab, plugin, component, getProviderCatalogConfig);
  buildTabInputController(tab, plugin, component, openConversation, forkAllCallback);
  buildTabNavigationController(tab, plugin);

  // Mount the Vue transcript island into the messages wrapper (the placeholder
  // `dom.messagesEl`). `TranscriptRoot` renders the real `.specorator-messages`
  // scroll container and hands it back through SCROLL_HOST_KEY; repoint
  // `dom.messagesEl` at it so every `getMessagesEl` closure targets the live
  // scrollable element.
  const wrapperEl = tab.dom.messagesEl;
  tab.mountedTranscript = mountTranscript(
    wrapperEl,
    plugin,
    component,
    buildTranscriptCallbacks(tab, plugin, forkMessageCallback),
  );
  const scrollEl = tab.mountedTranscript.getScrollEl();
  tab.dom.messagesEl = scrollEl ?? wrapperEl;
  // Bind the tab-chrome island's NavOverlay to the live scroll host on first
  // mount regardless of whether it differs from the placeholder wrapper —
  // `setScrollHost` is a no-op-safe reactive set.
  tab.mountedTabChrome?.setScrollHost(tab.dom.messagesEl);

  // `buildTabNavigationController` bound the NavigationController's keyboard
  // bindings (tabindex + focus class + keydown listener) against the
  // placeholder `wrapperEl` BEFORE this mount repointed `dom.messagesEl`. Rebind
  // it to the live Vue scroll element so vim-style keyboard scroll +
  // Escape-to-focus target the real scroll container, not the dead wrapper.
  // The controller reaches `dom.messagesEl` through a live getter, so only its
  // captured element / listener binding needs moving.
  if (scrollEl && scrollEl !== wrapperEl) {
    tab.mountedTabChrome?.setScrollHost(scrollEl);
    tab.controllers.navigationController?.rebindMessagesEl(scrollEl);
  }
}

/**
 * Builds the Vue→engine `TranscriptCallbacks` for one tab: thin delegators to
 * the tab's controllers + plugin (mirrors `SpecoratorView.buildChatShellCallbacks`).
 */
function buildTranscriptCallbacks(
  tab: TabData,
  plugin: SpecoratorPlugin,
  forkMessageCallback?: (userMessageId: string) => Promise<void>,
): TranscriptCallbacks {
  const isRewindEligible = (messageId: string): boolean => {
    const msgs = tab.state.messages;
    const idx = msgs.findIndex((m) => m.id === messageId);
    if (idx === -1) return false;
    const ctx = findRewindContext(msgs, idx);
    return ctx.hasResponse && !!ctx.prevAssistantUuid;
  };
  // A Team Chat DM tab owns a `surface: 'team-chat'` conversation. Gate the
  // reused-island actions that would otherwise resolve through the sidebar view
  // on that surface: fork is disabled (an unbound ad-hoc fork would escape the
  // surface filter and desync the room map), and message-action targeting rebases
  // onto the owning tab. Shares the `isTeamChatSurfaceConversation` seam with the
  // fork-command guard. Non-team-chat surfaces are byte-identical to before.
  const isTeamChatSurface = (): boolean => isTeamChatSurfaceConversation(plugin, tab.conversationId);
  // `getActiveConversationSnapshot()` reads the *sidebar* view, so on the Team
  // Chat surface it mis-targets (or no-ops on) a DM; there, target the owning tab.
  const resolveActionConversationId = (): string | null =>
    isTeamChatSurface()
      ? tab.conversationId ?? null
      : plugin.getActiveConversationSnapshot()?.id ?? tab.conversationId ?? null;

  return {
    subscribe: tab.transcript!.subscribe,
    onRewind: (id, mode) => tab.controllers.conversationController?.rewind(id, mode) ?? Promise.resolve(),
    onFork: (id) => forkMessageCallback?.(id) ?? Promise.resolve(),
    isRewindEligible,
    isForkEligible: (messageId) => !isTeamChatSurface() && isRewindEligible(messageId),
    openProviderSettings: (providerId) =>
      openSpecoratorProviderSettings(plugin.app, plugin.manifest.id, providerId),
    onRetryLastTurn: () => tab.controllers.inputController?.retryLastTurn(),
    canRetryLastTurn: () => tab.controllers.inputController?.hasRetryableTurn() ?? false,
    getMessageActions: (msg) =>
      eligibleMessageActions(plugin.chatMessageActions, msg).map((action) => ({
        id: action.id,
        label: action.label,
        icon: action.icon,
        run: () => action.run(msg, resolveActionConversationId()),
      })),
    copyText: (text) => {
      void navigator.clipboard?.writeText(text);
    },
    openFile: (path) => {
      void plugin.app.workspace.openLinkText(path, '', 'tab');
    },
    resolveImageSrc: (image) => resolveImageAttachmentSrc(plugin.app, image) ?? '',
    showFullImage: (image) =>
      showFullImageAttachment(plugin.app, tab.dom.messagesEl.ownerDocument, image),
    getProviderId: () => getTabProviderId(tab, plugin),
    getCapabilities: () => getTabCapabilities(tab, plugin),
    getWorkOrderPath: () =>
      tab.workOrderPath
      ?? (tab.conversationId
        ? plugin.getConversationSync(tab.conversationId)?.workOrderPath ?? null
        : null),
  };
}

/**
 * Chains a HOST notification onto the transcript re-projection `initializeTabControllers`
 * installs, using the same spread-and-wrap composition one layer up. Message add/remove/set
 * otherwise re-projects the TRANSCRIPT alone, so a host rendering anything derived from the
 * list — Team Chat's empty-DM starter card — stayed frozen: `beginStreamingTurnState` flips
 * `isStreaming` BEFORE the outgoing messages are appended, so a snapshot taken from the
 * streaming callback still reads the DM as empty.
 */
export function chainTabMessagesChanged(tab: TabData, notifyHost: () => void): void {
  const reprojectTranscript = tab.state.callbacks.onMessagesChanged;
  tab.state.callbacks = {
    ...tab.state.callbacks,
    onMessagesChanged: () => {
      reprojectTranscript?.();
      notifyHost();
    },
  };
}
