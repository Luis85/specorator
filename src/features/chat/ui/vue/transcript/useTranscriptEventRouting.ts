import { onMounted, onUnmounted } from 'vue';

import { useTranscriptStore } from './stores/transcriptStore';
import type { TranscriptSubscribe } from './transcriptCallbacks';

/**
 * Routes the view's ChatState-change stream into the Pinia transcript store.
 * The view owns the actual ChatState callbacks and pushes a fully-projected
 * TranscriptSnapshot on every change; this composable just fans it into the
 * store's setters and disposes the subscription on unmount. Mirrors
 * useChatShellEventRouting's mount/unmount ownership.
 */
export function useTranscriptEventRouting(subscribe: TranscriptSubscribe): void {
  const store = useTranscriptStore();
  let dispose: (() => void) | null = null;

  onMounted(() => {
    dispose = subscribe((snapshot) => {
      store.setMessages(snapshot.messages);
      store.setActiveStream(snapshot.activeStream);
      store.setGreeting(snapshot.greeting);
      store.setLoadingText(snapshot.loadingText);
      store.setHydrationError(snapshot.hydrationError);
    });
  });

  onUnmounted(() => {
    dispose?.();
    dispose = null;
  });
}
