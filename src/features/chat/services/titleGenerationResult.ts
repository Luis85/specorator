import type { TitleGenerationResult } from '../../../core/providers/types';
import type SpecoratorPlugin from '../../../main';

/**
 * Applies a title-generation outcome to a conversation — the single copy of the
 * user-rename-wins policy shared by the first-turn auto-title flow
 * (`InputController.triggerTitleGeneration`) and the history dropdown's manual
 * regenerate (`sidePanelCallbacks.regenerateHistoryTitle`):
 * - success + title still `expectedTitle` → apply the AI title, status `success`
 * - failure + title untouched → keep the fallback title, status `failed`
 * - user renamed mid-generation → their title wins, status cleared
 * Always broadcasts `conversation:title-status-changed` so every leaf's open
 * history dropdown re-projects the flip (status-only writes never fire
 * `conversation:renamed`).
 */
export async function applyTitleGenerationResult(
  plugin: SpecoratorPlugin,
  conversationId: string,
  expectedTitle: string,
  result: TitleGenerationResult,
): Promise<void> {
  const currentConv = await plugin.getConversationById(conversationId);
  if (!currentConv) return;
  const userManuallyRenamed = currentConv.title !== expectedTitle;
  if (result.success && !userManuallyRenamed) {
    await plugin.renameConversation(conversationId, result.title);
    await plugin.updateConversation(conversationId, { titleGenerationStatus: 'success' });
  } else if (!userManuallyRenamed) {
    await plugin.updateConversation(conversationId, { titleGenerationStatus: 'failed' });
  } else {
    await plugin.updateConversation(conversationId, { titleGenerationStatus: undefined });
  }
  plugin.events.emit('conversation:title-status-changed', { conversationId });
}
