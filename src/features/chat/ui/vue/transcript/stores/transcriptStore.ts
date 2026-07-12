import { defineStore } from 'pinia';
import { shallowRef } from 'vue';

import type { ChatMessage } from '../../../../../../core/types';
import type { ActiveStreamState } from '../../../../state/types';

// `ActiveStreamState` is defined in the engine's neutral `state/types` so
// `ChatState` can build it without importing this store; re-exported here to
// keep the store the canonical import site for Vue consumers.
export type { ActiveStreamState };

/** Mirrors `MessageRenderer`'s recorded hydration failure (see `setHydrationError`). */
export interface TranscriptHydrationError {
  code: string;
  message: string;
}

/**
 * Reactive read-model over the active tab's ChatState. Truth + I/O stay in
 * ChatState; every setter replaces a whole value (shallowRef) so a change fires
 * the watch without deep-proxy overhead. Mirrors useChatShellStore's contract.
 */
export const useTranscriptStore = defineStore('transcript', () => {
  const messages = shallowRef<ChatMessage[]>([]);
  const activeStream = shallowRef<ActiveStreamState | null>(null);
  /** Welcome greeting text (`ConversationController.getGreeting()`); engine-pushed. */
  const greeting = shallowRef<string>('');
  /** Non-null while a conversation/tab-switch hydration is in flight (`renderLoading`'s text). */
  const loadingText = shallowRef<string | null>(null);
  /** Recorded history-hydration failure banner (`setHydrationError`/`clearHydrationBanner`). */
  const hydrationError = shallowRef<TranscriptHydrationError | null>(null);

  function setMessages(next: ChatMessage[]): void {
    messages.value = next;
  }
  function setActiveStream(next: ActiveStreamState | null): void {
    activeStream.value = next;
  }
  function setGreeting(next: string): void {
    greeting.value = next;
  }
  function setLoadingText(next: string | null): void {
    loadingText.value = next;
  }
  function setHydrationError(next: TranscriptHydrationError | null): void {
    hydrationError.value = next;
  }

  return {
    messages,
    activeStream,
    greeting,
    loadingText,
    hydrationError,
    setMessages,
    setActiveStream,
    setGreeting,
    setLoadingText,
    setHydrationError,
  };
});
