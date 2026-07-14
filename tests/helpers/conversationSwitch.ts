import type { ConversationSwitchResult, HistoryLoadOutcome } from '@/core/providers/types';
import type { Conversation } from '@/core/types';

export function asSwitchResult(
  conversation: Conversation | Record<string, unknown>,
  hydration: HistoryLoadOutcome = { kind: 'cached', sourceRef: 'test' },
): ConversationSwitchResult {
  return { conversation: conversation as Conversation, hydration };
}

export function loadedSwitchResult(
  conversation: Conversation | Record<string, unknown>,
  messages: Conversation['messages'],
): ConversationSwitchResult {
  return asSwitchResult(
    { ...conversation, messages },
    { kind: 'loaded', messages, sourceRef: 'test' },
  );
}
