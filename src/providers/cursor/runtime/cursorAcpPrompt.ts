import type { PreparedChatTurn } from '../../../core/runtime/types';
import type { ChatMessage } from '../../../core/types';
import { buildContextFromHistory, buildPromptWithHistoryContext } from '../../../utils/session';
import type { AcpContentBlock } from '../../acp';

/**
 * Mirrors `buildOpencodePromptBlocks`, but seeds from `turn.prompt` — already
 * fully encoded (context envelope, `#`/`/`/`$` expansion) by `encodeCursorTurn` —
 * instead of re-rendering the raw request text.
 */
export function buildCursorAcpPromptBlocks(
  turn: PreparedChatTurn,
  conversationHistory: ChatMessage[] = [],
  boundAgentPrompt?: string,
): AcpContentBlock[] {
  let promptText = turn.prompt;

  if (conversationHistory.length > 0) {
    const historyContext = buildContextFromHistory(conversationHistory);
    promptText = buildPromptWithHistoryContext(historyContext, promptText, promptText, conversationHistory);
  }

  if (boundAgentPrompt) {
    promptText = `${boundAgentPrompt}\n\n---\n\n${promptText}`;
  }

  const blocks: AcpContentBlock[] = [{ type: 'text', text: promptText }];
  for (const image of turn.request.images ?? []) {
    if (!image.data) {
      continue;
    }
    blocks.push({ data: image.data, mimeType: image.mediaType, type: 'image' });
  }
  return blocks;
}
