/**
 * Message visibility predicates for the Vue transcript island. Extracted so the
 * per-block-type switch (which carries most of the branching weight) stays pure
 * once tool visibility is supplied as a callback. Consumed by `MessageBubble.vue`.
 */

import type { ChatMessage, ContentBlock } from '../../../../../core/types';

/**
 * Whether a single content block contributes visible output. `isToolVisible`
 * resolves a `tool_use` block's id against the message's tool calls and the
 * renderer's render policy; it owns all instance state so this stays pure.
 */
export function contentBlockHasVisibleContent(
  block: ContentBlock,
  isToolVisible: (toolId: string) => boolean,
): boolean {
  switch (block.type) {
    case 'thinking':
    case 'text':
      return block.content.trim().length > 0;
    case 'context_compacted':
    case 'runtime_error':
    case 'subagent':
      return true;
    case 'tool_use':
      return isToolVisible(block.toolId);
    default:
      return false;
  }
}

/** True when any content block in the message is visible. */
export function hasVisibleBlock(
  blocks: ContentBlock[] | undefined,
  isToolVisible: (toolId: string) => boolean,
): boolean {
  return Boolean(blocks?.some(block => contentBlockHasVisibleContent(block, isToolVisible)));
}

/** True when the message carries non-empty plain text content. */
export function hasVisibleText(msg: ChatMessage): boolean {
  return Boolean(msg.content && msg.content.trim().length > 0);
}

/** Any visible text, content block, or renderable tool call. */
export function hasAnyVisibleContent(
  msg: ChatMessage,
  isToolVisible: (toolId: string) => boolean,
): boolean {
  if (hasVisibleText(msg)) return true;
  if (hasVisibleBlock(msg.contentBlocks, isToolVisible)) return true;
  return Boolean(msg.toolCalls?.some((toolCall) => isToolVisible(toolCall.id)));
}

/**
 * Whether this message produces ANY DOM, mirroring `MessageBubble`'s template branch order:
 * a bare interrupt renders its marker, a rebuilt-context record renders nothing, a user
 * message always renders its shell, and an assistant message needs visible content.
 *
 * Shared with `MessageList`, which needs it for run-start attribution: restored history can
 * carry an empty assistant boundary record right before a visible assistant response, and if
 * the invisible one claims the run-opening identity header then the response below is treated
 * as a continuation and shows no attribution at all.
 */
export function rendersMessageBubble(
  msg: ChatMessage,
  isToolVisible: (toolId: string) => boolean,
): boolean {
  const visible = hasAnyVisibleContent(msg, isToolVisible);
  if (msg.isInterrupt && (msg.role === 'user' || !visible)) return true;
  if (msg.isRebuiltContext) return false;
  // The user branch renders its shell on text OR images — `textToShow` is the same
  // `displayContent ?? content` the template binds.
  if (msg.role === 'user') return Boolean(msg.displayContent ?? msg.content) || Boolean(msg.images?.length);
  return visible;
}
