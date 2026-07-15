import type { ChatMessage } from '../../../core/types';
import type { ChatState } from '../state/ChatState';

/**
 * Streaming assistant-message lifecycle helpers, extracted from `InputController`
 * during the transcript Vue cutover (ADR 0005 sub-project 2). The cutover moved
 * assistant-message activation/discard bookkeeping into `InputController`; these
 * pure functions keep that logic out of the grandfathered file. Each mutates
 * `ChatState` only — no DOM output beyond the detached sentinel element.
 */

/**
 * Marks `message` as the in-flight assistant turn for the stream pipeline.
 *
 * `currentContentEl` is a DETACHED element: it still marks "an assistant message
 * is active" for the stream pipeline's guards and supplies an `ownerDocument` for
 * timers, but subagent/legacy DOM writes vanish into it while the Vue transcript
 * renders `message` from reactive data. `activeMessageId`/`activeBlockIndex` are
 * the reactive-stream pointers the Vue transcript projects; the block index opens
 * (from -1) once the first text/thinking chunk lands (the coordinators own it).
 */
export function activateStreamingAssistantMessage(
  state: ChatState,
  messagesEl: HTMLElement,
  message: ChatMessage,
): void {
  state.currentContentEl = messagesEl.ownerDocument.createElement('div');
  state.currentTextEl = null;
  state.currentTextContent = '';
  state.currentThinkingState = null;
  state.activeMessageId = message.id;
  state.activeBlockIndex = -1;
}

/**
 * Drops a never-populated streaming assistant placeholder. The `messages` setter
 * fires `onMessagesChanged` → the transcript re-projects.
 */
export function discardStreamingAssistantMessage(state: ChatState, messageId: string): void {
  state.messages = state.messages.filter((message) => message.id !== messageId);
  state.currentContentEl = null;
  state.currentTextEl = null;
  state.currentTextContent = '';
  state.currentThinkingState = null;
  state.activeMessageId = null;
  state.activeBlockIndex = -1;
}
