import { onScopeDispose } from 'vue';

import { useTranscriptStore } from './stores/transcriptStore';
import type { TranscriptSubscribe } from './transcriptCallbacks';

/**
 * Routes the view's ChatState-change stream into the Pinia transcript store.
 * The view owns the actual ChatState callbacks and pushes a fully-projected
 * TranscriptSnapshot on every change; this composable just fans it into the
 * store's setters and disposes the subscription on unmount.
 *
 * Subscribe synchronously during setup (not in onMounted) so emissions that
 * land in the same turn as mountTranscript — e.g. restoreState → switchTo
 * Phase B completing before the first paint — are not dropped while
 * observers.size === 0.
 */
export function useTranscriptEventRouting(subscribe: TranscriptSubscribe): void {
  const store = useTranscriptStore();
  const dispose = subscribe((snapshot) => {
    store.setMessages(snapshot.messages);
    store.setActiveStream(snapshot.activeStream);
    store.setConversationIdentity(snapshot.conversationId, snapshot.projectionRevision);
    store.setGreeting(snapshot.greeting);
    store.setMessageIdentity(snapshot.messageIdentity);
    store.setLoadingText(snapshot.loadingText);
    store.setHydrationError(snapshot.hydrationError);
  });

  onScopeDispose(() => {
    dispose();
  });
}
