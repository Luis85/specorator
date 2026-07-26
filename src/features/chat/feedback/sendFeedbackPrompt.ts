import type { ChatMessage } from '@/core/types';
import { t } from '@/i18n/i18n';
import type SpecoratorPlugin from '@/main';

import { isSpecoratorView } from '../isSpecoratorView';

export type FeedbackDirection = 'up' | 'down';

/**
 * Sends the i18n-backed thumbs-up or thumbs-down prompt as a normal user turn
 * on the tab that owns the rated message. The owner is resolved across EVERY
 * chat surface (sidebar and Team Chat) first, falling back to the sidebar's
 * active tab only when no `conversationId` is supplied or no matching tab is
 * found.
 *
 * Side-effect-free apart from the resulting `inputController.sendMessage`
 * dispatch. No persistence on the rated message.
 */
export function sendFeedbackPrompt(
  plugin: SpecoratorPlugin,
  _message: ChatMessage,
  conversationId: string | null,
  direction: FeedbackDirection,
): void {
  const targetTab = resolveFeedbackTargetTab(plugin, conversationId);
  if (!targetTab) return;

  const promptKey =
    direction === 'up'
      ? 'chat.feedback.thumbsUp.prompt'
      : 'chat.feedback.thumbsDown.prompt';
  void targetTab.controllers.inputController?.sendMessage({ content: t(promptKey) });
}

/**
 * The tab the feedback turn should land on. The conversation-owning tab wins,
 * resolved via `findConversationAcrossViews` FIRST so it covers Team Chat leaves
 * too — `getView()` is sidebar-scoped and null when a Team Chat leaf is the only
 * open surface, so gating on it there would silently no-op reachable feedback.
 * The sidebar's active tab is the fallback only for a null/unmatched
 * conversationId (e.g. the conversation moved tabs between render and click).
 *
 * The `isSpecoratorView` structural guard recovers the concrete `TabManager`
 * (whose `getTab` yields the tab's controllers) from the neutral `ChatViewHandle`;
 * a `TeamChatView` passes the same `getTabManager` duck-type.
 */
function resolveFeedbackTargetTab(plugin: SpecoratorPlugin, conversationId: string | null) {
  if (conversationId) {
    const cross = plugin.findConversationAcrossViews(conversationId);
    if (cross && isSpecoratorView(cross.view)) {
      const owned = cross.view.getTabManager()?.getTab(cross.tabId);
      if (owned) return owned;
    }
  }
  return plugin.getView()?.getTabManager()?.getActiveTab() ?? null;
}
