import { onMounted, onUnmounted } from 'vue';

import type { ChatShellSubscribe } from './chatShellCallbacks';
import { useChatShellStore } from './stores/chatShellStore';

/**
 * Routes the view's TabManager-change stream into the Pinia shell store. The
 * view owns the actual TabManager callbacks and pushes a fully-projected
 * ChatShellSnapshot on every change; this composable just fans it into the
 * store's setters and disposes the subscription on unmount. Mirrors
 * useBoardEventRouting's mount/unmount ownership.
 */
export function useChatShellEventRouting(subscribe: ChatShellSubscribe): void {
  const store = useChatShellStore();
  let dispose: (() => void) | null = null;

  onMounted(() => {
    dispose = subscribe((snapshot) => {
      store.setTabs(snapshot.tabs);
      store.setHeader(snapshot.header);
      store.setActiveTabId(snapshot.activeTabId);
    });
  });

  onUnmounted(() => {
    dispose?.();
    dispose = null;
  });
}
