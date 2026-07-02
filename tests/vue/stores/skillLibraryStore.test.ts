import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSkillLibraryStore } from '@/features/library/vue/stores/skillLibraryStore';

const entry = {
  id: 'claude:skill-a', providerId: 'claude', providerDisplayName: 'Vault',
  name: 'a', description: 'd', insertPrefix: '$' as const,
  sourceFilePath: '.claude/skills/a/SKILL.md', providerEnabled: true,
};

function makePlugin(entries: unknown[]) {
  return {
    app: {},
    vaultSkillAggregator: { listAll: vi.fn().mockResolvedValue(entries) },
    vaultFileAdapter: {
      read: vi.fn().mockResolvedValue('---\ntags: [t1]\n---\nbody'),
      stat: vi.fn().mockResolvedValue({ mtime: 42 }),
      write: vi.fn().mockResolvedValue(undefined),
      exists: vi.fn().mockResolvedValue(false),
    },
    events: { emit: vi.fn() },
    logger: { scope: () => ({ error: vi.fn(), warn: vi.fn() }) },
  } as never;
}

describe('useSkillLibraryStore', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('load() builds rows with frontmatter tags and keeps the entry lookup', async () => {
    const store = useSkillLibraryStore();
    store.init(makePlugin([entry]));
    await store.load();
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].tags).toEqual(['t1']);
    expect(store.entryFor(store.rows[0].id)).toMatchObject({ name: 'a' });
    expect(store.mtimeFor(store.rows[0].id)).toBe(42);
  });

  it('a stale load resolving after a newer one cannot overwrite fresher state', async () => {
    const store = useSkillLibraryStore();
    const entryB = { ...entry, id: 'claude:skill-b', name: 'b', sourceFilePath: '.claude/skills/b/SKILL.md' };
    const plugin = makePlugin([entry]);
    let resolveStale: (v: unknown[]) => void = () => undefined;
    const p = plugin as { vaultSkillAggregator: { listAll: ReturnType<typeof vi.fn> } };
    p.vaultSkillAggregator.listAll = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { resolveStale = resolve; }))
      .mockResolvedValue([entry, entryB]);
    store.init(plugin);
    const stale = store.load(); // load A — blocked on listAll
    await store.load(); // load B — resolves with fresher data
    expect(store.rows).toHaveLength(2);
    resolveStale([entry]); // A resolves late with the stale single-entry list
    await stale;
    // Fresher result retained; lookup maps stay in sync with rows.
    expect(store.rows).toHaveLength(2);
    expect(store.entryFor('claude:skill-b')).toMatchObject({ name: 'b' });
    expect(store.mtimeFor('claude:skill-b')).toBe(42);
    expect(store.loading).toBe(false);
  });

  it('keeps loading true when an older load resolves while a newer one is pending', async () => {
    const store = useSkillLibraryStore();
    const plugin = makePlugin([entry]);
    const p = plugin as { vaultSkillAggregator: { listAll: ReturnType<typeof vi.fn> } };
    let resolveFirst: (v: unknown[]) => void = () => undefined;
    let resolveSecond: (v: unknown[]) => void = () => undefined;
    p.vaultSkillAggregator.listAll = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve; }));
    store.init(plugin);
    const first = store.load(); // older token
    const second = store.load(); // newer token — still pending
    resolveFirst([entry]);
    await first;
    // Guarded finally: the superseded load must NOT clear the flag out from
    // under the load that is still in flight.
    expect(store.loading).toBe(true);
    resolveSecond([entry]);
    await second;
    expect(store.loading).toBe(false);
  });

  it('clone() writes a -copy dir, emits vaultSkill.changed, and reloads', async () => {
    const store = useSkillLibraryStore();
    const plugin = makePlugin([entry]);
    store.init(plugin);
    await store.load();
    const clonePath = await store.clone(store.rows[0]);
    expect(clonePath).toBe('.claude/skills/a-copy/SKILL.md');
    const p = plugin as { vaultFileAdapter: { write: ReturnType<typeof vi.fn> }; events: { emit: ReturnType<typeof vi.fn> } };
    expect(p.vaultFileAdapter.write).toHaveBeenCalled();
    expect(p.events.emit).toHaveBeenCalledWith('vaultSkill.changed', { providerId: 'claude' });
  });

  it('clone() refuses non-cloneable (host-absolute) paths without writing', async () => {
    const store = useSkillLibraryStore();
    const plugin = makePlugin([entry]);
    store.init(plugin);
    await store.load();
    const result = await store.clone({ ...store.rows[0], sourceFilePath: '/home/u/.codex/skills/a/SKILL.md' });
    expect(result).toBeNull();
    const p = plugin as { vaultFileAdapter: { write: ReturnType<typeof vi.fn> } };
    expect(p.vaultFileAdapter.write).not.toHaveBeenCalled();
  });

  it('load() rejects when the store is used before init()', async () => {
    const store = useSkillLibraryStore();
    await expect(store.load()).rejects.toThrow('used before init()');
  });
});
