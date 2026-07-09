import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useLoopLibraryStore } from '@/features/library/vue/stores/loopLibraryStore';

const loopA = { path: 'l/a.md', id: 'a', name: 'A loop', useWhen: '', approach: 'x', steps: '', verify: '', notes: '', tags: ['t'] };

function makePlugin() {
  return {
    app: { vault: { getAbstractFileByPath: vi.fn().mockReturnValue(null) } },
    settings: { agentBoardLoopFolder: '' },
    logger: { scope: () => ({ error: vi.fn(), warn: vi.fn() }) },
  } as never;
}

describe('useLoopLibraryStore', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('load() lists loops from the note store into reactive state', async () => {
    const store = useLoopLibraryStore();
    store.init(makePlugin(), {
      list: vi.fn().mockResolvedValue({ loops: [loopA], warnings: [] }),
    } as never);
    await store.load();
    expect(store.loops).toHaveLength(1);
    expect(store.loading).toBe(false);
  });

  it('clone() saves "<name> copy" with a deduped name, then reloads', async () => {
    const store = useLoopLibraryStore();
    const noteStore = {
      list: vi.fn().mockResolvedValue({ loops: [loopA], warnings: [] }),
      save: vi.fn().mockResolvedValue('l/a-copy.md'),
      getFilePathForName: (_f: string, name: string) => `l/${name}.md`,
    };
    const plugin = makePlugin();
    // First candidate exists -> expect "A loop copy 2"
    (plugin as { app: { vault: { getAbstractFileByPath: ReturnType<typeof vi.fn> } } }).app.vault
      .getAbstractFileByPath = vi.fn((p: string) => (p === 'l/A loop copy.md' ? {} : null));
    store.init(plugin, noteStore as never);
    await store.clone(loopA as never);
    expect(noteStore.save).toHaveBeenCalledWith(
      expect.anything(), 'Agent Board/loops',
      expect.objectContaining({ name: 'A loop copy 2' }),
    );
    expect(noteStore.list).toHaveBeenCalled();
  });

  it('save() persists through the note store and reloads', async () => {
    const store = useLoopLibraryStore();
    const noteStore = {
      list: vi.fn().mockResolvedValue({ loops: [], warnings: [] }),
      save: vi.fn().mockResolvedValue('l/new.md'),
    };
    store.init(makePlugin(), noteStore as never);
    await store.save({ name: 'New', useWhen: '', approach: 'a', steps: '', verify: '', notes: '' });
    expect(noteStore.save).toHaveBeenCalled();
    expect(noteStore.list).toHaveBeenCalled();
  });

  it('remove() deletes through the note store and reloads', async () => {
    const store = useLoopLibraryStore();
    const noteStore = {
      list: vi.fn().mockResolvedValue({ loops: [], warnings: [] }),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    store.init(makePlugin(), noteStore as never);
    await store.remove(loopA as never);
    expect(noteStore.delete).toHaveBeenCalledWith(expect.anything(), 'l/a.md');
    expect(noteStore.list).toHaveBeenCalled();
  });

  it('a stale load resolving after a newer one cannot overwrite fresher state', async () => {
    const store = useLoopLibraryStore();
    const loopB = { ...loopA, path: 'l/b.md', id: 'b', name: 'B loop' };
    let resolveStale: (v: unknown) => void = () => undefined;
    const noteStore = {
      list: vi.fn()
        .mockImplementationOnce(() => new Promise((resolve) => { resolveStale = resolve; }))
        .mockResolvedValue({ loops: [loopA, loopB], warnings: [] }),
    };
    store.init(makePlugin(), noteStore as never);
    const stale = store.load(); // load A — blocked on list()
    await store.load(); // load B — resolves with fresher data
    expect(store.loops).toHaveLength(2);
    resolveStale({ loops: [loopA], warnings: [] }); // A resolves late with the stale list
    await stale;
    // Fresher result retained; the guarded finally left `loading` settled.
    expect(store.loops).toHaveLength(2);
    expect(store.loading).toBe(false);
  });

  it('load() merges by identity: unchanged loops keep their reference, the changed one is new', async () => {
    const loopB = { ...loopA, path: 'l/b.md', id: 'b', name: 'B loop' };
    const store = useLoopLibraryStore();
    const noteStore = {
      list: vi.fn()
        .mockResolvedValueOnce({ loops: [{ ...loopA }, { ...loopB }], warnings: [] })
        .mockResolvedValueOnce({ loops: [{ ...loopA }, { ...loopB, notes: 'edited' }], warnings: [] }),
    };
    store.init(makePlugin(), noteStore as never);
    await store.load();
    const [firstA, firstB] = store.loops;
    await store.load(); // mutation reload: only B changed
    expect(store.loops[0]).toBe(firstA);
    expect(store.loops[1]).not.toBe(firstB);
  });

  it('load() rejects when the store is used before init()', async () => {
    const store = useLoopLibraryStore();
    await expect(store.load()).rejects.toThrow('used before init()');
  });
});
