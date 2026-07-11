import type { ChatTurnMetadata } from '../../core/runtime/types';
import type { StreamChunk } from '../../core/types';
import type { AcpNormalizedUpdate } from './AcpSessionUpdateNormalizer';
import type { AcpToolStreamAdapter } from './AcpToolStreamAdapter';
import { buildAcpUsageInfo } from './buildAcpUsageInfo';
import type { AcpUsage, AcpUsageUpdate } from './types';

/**
 * Active-turn updates fan out into stream chunks plus a few turn-scoped state
 * mutations. Keeping the projection pure lets the runtime own the actual writes
 * to `currentTurnMetadata`, `currentTurnSawAssistantContent`, and `contextUsage`
 * while this module stays free of runtime state.
 */
export interface ActiveTurnEffect {
  chunks: StreamChunk[];
  metadataPatch?: Partial<ChatTurnMetadata>;
  sawAssistantContent?: boolean;
  contextUsage?: AcpUsageUpdate;
}

export interface ActiveTurnUpdateContext {
  toolStreamAdapter: AcpToolStreamAdapter;
  sessionId: string;
  // Resolved lazily: the display model is only needed for usage updates, and
  // resolving it can be expensive (or fail before the session is fully set up).
  resolveUsageModel: () => string;
  promptUsage: AcpUsage | null;
}

type ActiveTurnUpdate = Extract<
  AcpNormalizedUpdate,
  { type: 'message_chunk' | 'tool_call' | 'tool_call_update' | 'usage' }
>;

function buildMessageChunkEffect(
  update: Extract<AcpNormalizedUpdate, { type: 'message_chunk' }>,
): ActiveTurnEffect {
  const metadataPatch: Partial<ChatTurnMetadata> = {};
  if (update.role === 'assistant' && update.messageId) {
    metadataPatch.assistantMessageId = update.messageId;
  }
  if (update.role === 'user' && update.messageId) {
    metadataPatch.userMessageId = update.messageId;
  }

  return {
    chunks: [...update.streamChunks],
    metadataPatch,
    // Only real content counts: an empty assistant message_chunk still carries
    // the `assistant_message_start` boundary chunk, so gating on chunk *presence*
    // would let a content-free plan turn open the post-plan approval card. Count
    // only text/thinking chunks so the "produced assistant content" gate is true.
    sawAssistantContent: update.role === 'assistant'
      && update.streamChunks.some((chunk) => chunk.type === 'text' || chunk.type === 'thinking'),
  };
}

function buildToolCallEffect(
  update: Extract<AcpNormalizedUpdate, { type: 'tool_call' | 'tool_call_update' }>,
  toolStreamAdapter: AcpToolStreamAdapter,
): ActiveTurnEffect {
  const chunks = update.type === 'tool_call'
    ? toolStreamAdapter.normalizeToolCall(update.toolCall, update.streamChunks)
    : toolStreamAdapter.normalizeToolCallUpdate(update.toolCallUpdate, update.streamChunks);
  return { chunks };
}

function buildUsageEffect(
  update: Extract<AcpNormalizedUpdate, { type: 'usage' }>,
  context: ActiveTurnUpdateContext,
): ActiveTurnEffect {
  const usage = buildAcpUsageInfo({
    contextWindow: update.usage,
    model: context.resolveUsageModel(),
    promptUsage: context.promptUsage,
  });
  return {
    chunks: usage
      ? [{ sessionId: context.sessionId, type: 'usage', usage }]
      : [],
    contextUsage: update.usage,
  };
}

export function buildActiveTurnEffect(
  update: ActiveTurnUpdate,
  context: ActiveTurnUpdateContext,
): ActiveTurnEffect {
  switch (update.type) {
    case 'message_chunk':
      return buildMessageChunkEffect(update);
    case 'tool_call':
    case 'tool_call_update':
      return buildToolCallEffect(update, context.toolStreamAdapter);
    case 'usage':
      return buildUsageEffect(update, context);
  }
}
