import { defineStore } from 'pinia';
import { ref } from 'vue';

import type SpecoratorPlugin from '../../../../main';
import { assignNextFavoriteRank, QuickActionStorage } from '../../../quickActions/QuickActionStorage';
import type { QuickAction } from '../../../quickActions/types';
import { mergeById } from '../mergeById';
import { useGuardedLoad } from '../useGuardedLoad';

/**
 * Reactive projection over QuickActionStorage for the Library tab. I/O stays
 * in the storage class; every mutation reloads so all mounted leaves
 * re-derive (house pattern, mirrors skillLibraryStore).
 */
export const useQuickActionStore = defineStore('library-quick-actions', () => {
  const actions = ref<QuickAction[]>([]);
  const { loading, run } = useGuardedLoad();
  const error = ref<string | null>(null);
  const folderConfigured = ref(true);

  let plugin: SpecoratorPlugin | null = null;
  let storage: QuickActionStorage | null = null;

  function init(p: SpecoratorPlugin): void {
    if (plugin) return;
    plugin = p;
    // Same wiring (adapter + live folder getter + 'Quick Actions' default) as
    // openQuickActionsModal/main.ts — the tab and the modal must scan ONE
    // folder or actions saved in one surface vanish from the other.
    storage = new QuickActionStorage(
      p.storage.getAdapter(),
      () => p.settings.quickActionsFolder ?? 'Quick Actions',
    );
  }

  async function load(): Promise<void> {
    if (!storage) return;
    const s = storage;
    await run(
      () => {
        folderConfigured.value = s.hasConfiguredFolder();
        return s.loadAll();
      },
      (next) => {
        // Merge by identity (filePath is the stable key) so untouched quick-action
        // cards keep their previous reference — no icon repaint on a mutation reload.
        actions.value = mergeById(actions.value, next, (a) => a.filePath);
        error.value = null;
      },
      (e) => { error.value = e instanceof Error ? e.message : String(e); },
    );
  }

  /** Editor-modal persistence path (panel onSave routes here so the modal
   * never needs the storage handle). */
  async function save(action: QuickAction): Promise<void> {
    if (!storage) return;
    await storage.save(action);
    plugin?.quickActionFavoritesCache?.refresh();
    await load();
  }

  async function remove(action: QuickAction): Promise<boolean> {
    if (!storage) return false;
    await storage.delete(action.filePath);
    plugin?.quickActionFavoritesCache?.refresh();
    await load();
    return true;
  }

  async function duplicate(action: QuickAction): Promise<QuickAction | null> {
    if (!storage) return null;
    // Probe through the storage's own path derivation (same slugging save()
    // uses) so the collision check and the eventual write agree on the path.
    let name = `${action.name} copy`;
    for (let n = 2; await storage.exists(storage.getFilePathForName(name)); n++) {
      name = `${action.name} copy ${n}`;
    }
    // Strip favorite state: a copy inheriting the rank would put two actions
    // on one slot of the five-rank favorites strip. Empty filePath lets
    // storage.save derive the path from the new name.
    const copy: QuickAction = { ...action, name, filePath: '', favorite: undefined, favoriteRank: undefined };
    await storage.save(copy);
    await load();
    return copy;
  }

  async function toggleFavorite(action: QuickAction): Promise<void> {
    if (!storage) return;
    if (action.favorite) {
      await storage.unsetFavorite(action);
    } else {
      const rank = assignNextFavoriteRank(actions.value);
      if (rank === null) return; // favorite cap reached — storage rule owns the limit
      await storage.setFavorite(action, rank);
    }
    plugin?.quickActionFavoritesCache?.refresh();
    await load();
  }

  return { actions, loading, error, folderConfigured, init, load, save, remove, duplicate, toggleFavorite };
});
