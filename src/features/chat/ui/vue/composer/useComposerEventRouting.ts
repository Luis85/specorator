import { onScopeDispose } from 'vue';

import type { ComposerSubscribe } from './composerCallbacks';
import { useComposerStore } from './stores/composerStore';

/**
 * Routes the tab's composer-change stream into the Pinia store. The engine owns
 * the real callbacks and pushes a fully-projected ComposerSnapshot on every
 * change; this fans it into the store's setters and disposes on unmount.
 *
 * Subscribe SYNCHRONOUSLY during setup (not onMounted) so an emission that lands
 * in the same turn as mountComposer is not dropped while observers.size === 0.
 */
export function useComposerEventRouting(subscribe: ComposerSubscribe): void {
  const store = useComposerStore();
  const dispose = subscribe((snapshot) => {
    store.setToolbar(snapshot.toolbar);
    store.setChips(snapshot.chips);
    store.setEditedFiles(snapshot.editedFiles);
    store.setDropdown(snapshot.dropdown);
    store.setWrapperMode(snapshot.wrapperMode);
  });

  onScopeDispose(() => {
    dispose();
  });
}
