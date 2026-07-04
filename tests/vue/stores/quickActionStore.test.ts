import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as quickActionStorageModule from '@/features/quickActions/QuickActionStorage';
import type { QuickAction } from '@/features/quickActions/types';

interface FakeStorage {
  getFolderPath: () => string;
  hasConfiguredFolder: ReturnType<typeof vi.fn>;
  loadAll: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  exists: ReturnType<typeof vi.fn>;
  setFavorite: ReturnType<typeof vi.fn>;
  unsetFavorite: ReturnType<typeof vi.fn>;
  getFilePathForName: ReturnType<typeof vi.fn>;
}

const h = vi.hoisted(() => ({ instances: [] as unknown[] }));

// The store constructs its own QuickActionStorage (same wiring as
// openQuickActionsModal). Replace the class with a capture-and-stub fake so
// tests pin the exact storage-call seam; assignNextFavoriteRank stays REAL —
// the rank rule (next free rank, cap of five) is behavior under test.
vi.mock('@/features/quickActions/QuickActionStorage', async (importOriginal) => {
  const actual = await importOriginal<typeof quickActionStorageModule>();
  class FakeQuickActionStorage {
    getFolderPath: () => string;
    hasConfiguredFolder = vi.fn().mockReturnValue(true);
    loadAll = vi.fn().mockResolvedValue([]);
    save = vi.fn().mockResolvedValue('Quick Actions/saved.md');
    delete = vi.fn().mockResolvedValue(undefined);
    exists = vi.fn().mockResolvedValue(false);
    setFavorite = vi.fn().mockResolvedValue(undefined);
    unsetFavorite = vi.fn().mockResolvedValue(undefined);
    getFilePathForName = vi.fn((name: string) => `Quick Actions/${name}.md`);
    constructor(_adapter: unknown, getFolderPath: () => string) {
      this.getFolderPath = getFolderPath;
      h.instances.push(this);
    }
  }
  return { ...actual, QuickActionStorage: FakeQuickActionStorage };
});

import { quickActionLibraryAccessors } from '@/features/library/vue/quickActionLibraryAccessors';
import { useQuickActionStore } from '@/features/library/vue/stores/quickActionStore';

const baseAction: QuickAction = {
  id: 'summarize',
  name: 'Summarize',
  description: 'd',
  prompt: 'p',
  filePath: 'Quick Actions/summarize.md',
};

function makePlugin(settings: { quickActionsFolder?: string } = {}) {
  return {
    settings,
    storage: { getAdapter: vi.fn(() => ({})) },
    quickActionFavoritesCache: { refresh: vi.fn() },
  };
}

function initStore(plugin = makePlugin()) {
  const store = useQuickActionStore();
  store.init(plugin as never);
  const storage = h.instances.at(-1) as FakeStorage;
  return { store, plugin, storage };
}

describe('useQuickActionStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    h.instances.length = 0;
  });

  it('init() wires storage to the live quickActionsFolder setting with the "Quick Actions" default', () => {
    const plugin = makePlugin({});
    const { storage } = initStore(plugin);
    // Same default as openQuickActionsModal/main.ts — the tab and the modal
    // must scan ONE folder or actions saved in one vanish from the other.
    expect(storage.getFolderPath()).toBe('Quick Actions');
    plugin.settings.quickActionsFolder = 'Custom/QA';
    expect(storage.getFolderPath()).toBe('Custom/QA');
  });

  it('init() is a one-shot guard: a second init() does not rebuild storage', () => {
    const { store } = initStore();
    store.init(makePlugin() as never);
    expect(h.instances).toHaveLength(1);
  });

  it('load() projects storage.loadAll into actions', async () => {
    const { store, storage } = initStore();
    storage.loadAll.mockResolvedValue([baseAction]);
    await store.load();
    expect(store.actions).toEqual([baseAction]);
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
  });

  it('load() exposes folderConfigured from storage.hasConfiguredFolder', async () => {
    const { store, storage } = initStore();
    storage.hasConfiguredFolder.mockReturnValue(false);
    await store.load();
    expect(store.folderConfigured).toBe(false);
  });

  it('a stale load resolving after a newer one cannot overwrite fresher state', async () => {
    const { store, storage } = initStore();
    const second = { ...baseAction, id: 'b', name: 'B', filePath: 'Quick Actions/b.md' };
    let resolveStale: (v: QuickAction[]) => void = () => undefined;
    storage.loadAll
      .mockImplementationOnce(() => new Promise((resolve) => { resolveStale = resolve; }))
      .mockResolvedValue([baseAction, second]);
    const stale = store.load(); // load A — blocked on loadAll
    await store.load(); // load B — resolves with fresher data
    expect(store.actions).toHaveLength(2);
    resolveStale([baseAction]); // A resolves late with the stale single-entry list
    await stale;
    expect(store.actions).toHaveLength(2);
    expect(store.loading).toBe(false);
  });

  it('keeps loading true when an older load resolves while a newer one is pending', async () => {
    const { store, storage } = initStore();
    let resolveFirst: (v: QuickAction[]) => void = () => undefined;
    let resolveSecond: (v: QuickAction[]) => void = () => undefined;
    storage.loadAll
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve; }));
    const first = store.load();
    const second = store.load();
    resolveFirst([baseAction]);
    await first;
    // Guarded finally: the superseded load must NOT clear the flag out from
    // under the load that is still in flight.
    expect(store.loading).toBe(true);
    resolveSecond([baseAction]);
    await second;
    expect(store.loading).toBe(false);
  });

  it('load() captures storage failures in error and clears it on the next success', async () => {
    const { store, storage } = initStore();
    storage.loadAll.mockRejectedValueOnce(new Error('boom')).mockResolvedValue([]);
    await store.load();
    expect(store.error).toBe('boom');
    expect(store.loading).toBe(false);
    await store.load();
    expect(store.error).toBeNull();
  });

  it('remove() deletes by filePath, refreshes the favorites cache, and reloads', async () => {
    const { store, plugin, storage } = initStore();
    const removed = await store.remove(baseAction);
    expect(removed).toBe(true);
    expect(storage.delete).toHaveBeenCalledWith('Quick Actions/summarize.md');
    expect(plugin.quickActionFavoritesCache.refresh).toHaveBeenCalled();
    // Multi-leaf staleness contract: every mutation reloads the shared store.
    expect(storage.loadAll).toHaveBeenCalledTimes(1);
  });

  it('duplicate() saves "<name> copy" probed through getFilePathForName + exists, strips favorite state, and reloads', async () => {
    const { store, storage } = initStore();
    const favorite = { ...baseAction, favorite: true, favoriteRank: 3 };
    const copy = await store.duplicate(favorite);
    // Collision probe goes through the storage's own path derivation — the
    // same slugging save() uses — never a hand-rolled path.
    expect(storage.getFilePathForName).toHaveBeenCalledWith('Summarize copy');
    expect(storage.exists).toHaveBeenCalledWith('Quick Actions/Summarize copy.md');
    expect(storage.save).toHaveBeenCalledTimes(1);
    const saved = storage.save.mock.calls[0][0] as QuickAction;
    expect(saved.name).toBe('Summarize copy');
    // A copy must not inherit favorite rank: two actions on one rank would
    // corrupt the five-slot favorites strip.
    expect(saved.favorite).toBeUndefined();
    expect(saved.favoriteRank).toBeUndefined();
    // Empty filePath lets storage.save derive the path from the new name.
    expect(saved.filePath).toBe('');
    expect(copy?.name).toBe('Summarize copy');
    expect(storage.loadAll).toHaveBeenCalledTimes(1);
  });

  it('duplicate() steps to "<name> copy 2" when the first candidate exists', async () => {
    const { store, storage } = initStore();
    storage.exists.mockImplementation(
      (path: string) => Promise.resolve(path === 'Quick Actions/Summarize copy.md'),
    );
    await store.duplicate(baseAction);
    expect(storage.getFilePathForName.mock.calls.map((c) => c[0])).toEqual([
      'Summarize copy',
      'Summarize copy 2',
    ]);
    const saved = storage.save.mock.calls[0][0] as QuickAction;
    expect(saved.name).toBe('Summarize copy 2');
  });

  it('toggleFavorite() on a non-favorite assigns the next free rank, refreshes, and reloads', async () => {
    const { store, plugin, storage } = initStore();
    const other = { ...baseAction, id: 'o', name: 'Other', filePath: 'Quick Actions/other.md' };
    storage.loadAll.mockResolvedValue([{ ...baseAction, favorite: true, favoriteRank: 1 }, other]);
    await store.load();
    await store.toggleFavorite(other);
    // Real assignNextFavoriteRank: rank 1 is taken, so the next free rank is 2.
    expect(storage.setFavorite).toHaveBeenCalledWith(other, 2);
    expect(plugin.quickActionFavoritesCache.refresh).toHaveBeenCalled();
    expect(storage.loadAll).toHaveBeenCalledTimes(2);
  });

  it('toggleFavorite() no-ops at the five-favorite cap without refreshing or reloading', async () => {
    const { store, plugin, storage } = initStore();
    const favorites = [1, 2, 3, 4, 5].map((rank) => ({
      ...baseAction, id: `f${rank}`, filePath: `Quick Actions/f${rank}.md`,
      favorite: true, favoriteRank: rank,
    }));
    const sixth = { ...baseAction, id: 'six', filePath: 'Quick Actions/six.md' };
    storage.loadAll.mockResolvedValue([...favorites, sixth]);
    await store.load();
    await store.toggleFavorite(sixth);
    expect(storage.setFavorite).not.toHaveBeenCalled();
    expect(plugin.quickActionFavoritesCache.refresh).not.toHaveBeenCalled();
    expect(storage.loadAll).toHaveBeenCalledTimes(1);
  });

  it('toggleFavorite() on a favorite unsets it, refreshes, and reloads', async () => {
    const { store, plugin, storage } = initStore();
    const favorite = { ...baseAction, favorite: true, favoriteRank: 1 };
    await store.toggleFavorite(favorite);
    expect(storage.unsetFavorite).toHaveBeenCalledWith(favorite);
    expect(storage.setFavorite).not.toHaveBeenCalled();
    expect(plugin.quickActionFavoritesCache.refresh).toHaveBeenCalled();
    expect(storage.loadAll).toHaveBeenCalledTimes(1);
  });

  it('save() persists through storage, refreshes the favorites cache, and reloads (editor-modal onSave path)', async () => {
    const { store, plugin, storage } = initStore();
    await store.save(baseAction);
    expect(storage.save).toHaveBeenCalledWith(baseAction);
    expect(plugin.quickActionFavoritesCache.refresh).toHaveBeenCalled();
    expect(storage.loadAll).toHaveBeenCalledTimes(1);
  });
});

describe('quickActionLibraryAccessors', () => {
  it('maps QuickAction fields; updated degrades to 0 (quick actions carry no mtime)', () => {
    expect(quickActionLibraryAccessors.getName(baseAction)).toBe('Summarize');
    expect(quickActionLibraryAccessors.getDescription(baseAction)).toBe('d');
    expect(quickActionLibraryAccessors.getTags({ ...baseAction, tags: ['t'] })).toEqual(['t']);
    expect(quickActionLibraryAccessors.getTags(baseAction)).toEqual([]);
    expect(quickActionLibraryAccessors.getUpdatedAt(baseAction)).toBe(0);
  });
});
