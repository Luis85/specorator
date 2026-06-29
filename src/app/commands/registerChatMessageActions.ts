import { sendFeedbackPrompt } from '@/features/chat/feedback/sendFeedbackPrompt';
import { isCaptureEligible, openCaptureFromMessage } from '@/features/quickActions/captureFromMessage';
import type { ChatWorkOrderLinker } from '@/features/tasks/execution/ChatWorkOrderLinker';
import { t } from '@/i18n/i18n';
import type SpecoratorPlugin from '@/main';
import { chatMessageText } from '@/utils/chatMessageText';

export interface ChatMessageActionDeps {
  plugin: SpecoratorPlugin;
  chatWorkOrderLinker: ChatWorkOrderLinker;
}

/**
 * Registers the assistant/user message toolbar actions. Lifted out of `onload`
 * so `main.ts` reads as orchestration. Registration order is left-to-right
 * render order inside `.specorator-text-actions` (left of the copy button):
 * thumbs-up, thumbs-down, work-order — the capture action targets user messages
 * only (gated by `isCaptureEligible`).
 */
export function registerChatMessageActions({ plugin, chatWorkOrderLinker }: ChatMessageActionDeps): void {
  plugin.registerChatMessageAction({
    id: 'thumbs-up-feedback',
    label: t('chat.feedback.thumbsUp.label'),
    icon: 'thumbs-up',
    isEligible: (msg) => msg.role === 'assistant' && Boolean(chatMessageText(msg)),
    run: (msg, conversationId) => {
      sendFeedbackPrompt(plugin, msg, conversationId, 'up');
    },
  });

  plugin.registerChatMessageAction({
    id: 'thumbs-down-feedback',
    label: t('chat.feedback.thumbsDown.label'),
    icon: 'thumbs-down',
    isEligible: (msg) => msg.role === 'assistant' && Boolean(chatMessageText(msg)),
    run: (msg, conversationId) => {
      sendFeedbackPrompt(plugin, msg, conversationId, 'down');
    },
  });

  plugin.registerChatMessageAction({
    id: 'create-work-order-from-message',
    label: 'Create work order',
    icon: 'kanban-square',
    isEligible: (msg) => msg.role === 'assistant' && Boolean(chatMessageText(msg)),
    run: (msg, conversationId) => {
      void chatWorkOrderLinker.promoteMessageToWorkOrder(msg, conversationId);
    },
  });

  plugin.registerChatMessageAction({
    id: 'capture-prompt-as-quick-action',
    label: t('quickActions.capture.label'),
    icon: 'bookmark-plus',
    isEligible: isCaptureEligible,
    run: (msg) => openCaptureFromMessage(plugin, msg),
  });
}
