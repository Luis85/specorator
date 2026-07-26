import { onUnmounted } from 'vue';

import { useTeamChatStore } from './stores/teamChatStore';
import type { TeamChatSubscribe } from './teamChatCallbacks';

/**
 * Routes the view's Team-Chat-change stream into the Pinia store (mirror of
 * `useChatShellEventRouting`). The view owns the TabManager callbacks + the
 * selected-agent, projects a `TeamChatSnapshot` on every change, and this
 * composable fans it into the store setters.
 *
 * Subscribes SYNCHRONOUSLY during setup (not `onMounted`) so a restore-time emit
 * — fired while the engine builds inside the root's `onMounted`, after setup but
 * possibly before a deferred subscription would attach — is never dropped
 * (same reasoning as the composer island's sync subscribe).
 */
export function useTeamChatEventRouting(subscribe: TeamChatSubscribe): void {
  const store = useTeamChatStore();
  const dispose = subscribe((snapshot) => {
    store.setSelected(snapshot.selectedAgentId);
    store.setEditedFiles(snapshot.editedFiles);
    store.setActiveProviderId(snapshot.activeProviderId);
    store.setPresence(snapshot.presence);
    store.setActiveModelLabel(snapshot.activeModelLabel);
    store.setThreads(snapshot.threads);
    store.setUnread(snapshot.unread);
    store.setActiveDmIsEmpty(snapshot.activeDmIsEmpty);
  });
  onUnmounted(dispose);
}
