import { onScopeDispose } from 'vue';

import { useTabChromeStore } from './stores/tabChromeStore';
import type { TabChromeSubscribe } from './tabChromeCallbacks';

/** Routes the tab's chrome-change stream into the Pinia store. Subscribe
 *  SYNCHRONOUSLY during setup (mirror of useComposerEventRouting) so a same-turn
 *  emit is not dropped while observers.size === 0. */
export function useTabChromeEventRouting(subscribe: TabChromeSubscribe): void {
  const store = useTabChromeStore();
  const dispose = subscribe((snapshot) => {
    store.setTodos(snapshot.todos);
    store.setBashOutputs(snapshot.bashOutputs);
  });
  onScopeDispose(() => { dispose(); });
}
