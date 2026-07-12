import { defineStore } from 'pinia';
import { shallowRef } from 'vue';

import type { ChatMessage } from '../../../../../../core/types';

/** The in-flight turn's reactive state. Null when no turn is streaming. */
export interface ActiveStreamState {
  /** id of the assistant ChatMessage currently being appended to. */
  messageId: string;
  /** index into that message's contentBlocks of the block being written. */
  blockIndex: number;
  isThinking: boolean;
  isWriting: boolean;
  elapsedSeconds: number;
}

/**
 * Reactive read-model over the active tab's ChatState. Truth + I/O stay in
 * ChatState; every setter replaces a whole value (shallowRef) so a change fires
 * the watch without deep-proxy overhead. Mirrors useChatShellStore's contract.
 */
export const useTranscriptStore = defineStore('transcript', () => {
  const messages = shallowRef<ChatMessage[]>([]);
  const activeStream = shallowRef<ActiveStreamState | null>(null);

  function setMessages(next: ChatMessage[]): void {
    messages.value = next;
  }
  function setActiveStream(next: ActiveStreamState | null): void {
    activeStream.value = next;
  }

  return { messages, activeStream, setMessages, setActiveStream };
});
