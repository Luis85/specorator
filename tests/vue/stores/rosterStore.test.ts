import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useRosterStore } from '@/features/library/vue/stores/rosterStore';

const agent = {
  id: 'roster:a', name: 'Alice', description: 'router', prompt: '', disallowedTools: [],
  skills: [], roles: ['worker'] as Array<'worker' | 'verifier'>, tags: ['t'],
  createdAt: 1, updatedAt: 2,
};

function makePlugin(agents: unknown[]) {
  const rosterStore = {
    list: vi.fn().mockResolvedValue(agents),
    save: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  const removeRosterAgentProjection = vi.fn().mockResolvedValue(undefined);
  const warn = vi.fn();
  return {
    plugin: {
      agentRosterStore: rosterStore,
      removeRosterAgentProjection,
      logger: { scope: () => ({ warn, error: vi.fn(), debug: vi.fn() }) },
    } as never,
    rosterStore,
    removeRosterAgentProjection,
    warn,
  };
}

describe('useRosterStore', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('load() lists agents into reactive state', async () => {
    const { plugin } = makePlugin([agent]);
    const store = useRosterStore();
    store.init(plugin);
    await store.load();
    expect(store.agents).toHaveLength(1);
    expect(store.loading).toBe(false);
  });

  it('a stale load resolving after a newer one cannot overwrite fresher state', async () => {
    const { plugin, rosterStore } = makePlugin([agent]);
    const agentB = { ...agent, id: 'roster:b', name: 'Bob' };
    let resolveStale: (v: unknown[]) => void = () => undefined;
    rosterStore.list = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { resolveStale = resolve; }))
      .mockResolvedValue([agent, agentB]);
    const store = useRosterStore();
    store.init(plugin);
    const stale = store.load(); // load A — blocked on list()
    await store.load(); // load B — resolves with fresher data
    expect(store.agents).toHaveLength(2);
    resolveStale([agent]); // A resolves late with the stale single-agent list
    await stale;
    // Fresher result retained; the guarded finally left `loading` settled.
    expect(store.agents).toHaveLength(2);
    expect(store.loading).toBe(false);
  });

  it('clone() saves "<name> copy" with deduped id and returns the clone', async () => {
    const { plugin, rosterStore } = makePlugin([agent]);
    const store = useRosterStore();
    store.init(plugin);
    await store.load();
    const clone = await store.clone(agent as never);
    expect(clone.name).toBe('Alice copy');
    expect(clone.id).not.toBe(agent.id);
    expect(rosterStore.save).toHaveBeenCalledWith(expect.objectContaining({ name: 'Alice copy' }));
  });

  it('clone() probes "<name> copy 2" when the copy name is taken, and reloads', async () => {
    const existingCopy = { ...agent, id: 'roster:alice-copy', name: 'Alice copy' };
    const { plugin, rosterStore } = makePlugin([agent, existingCopy]);
    const store = useRosterStore();
    store.init(plugin);
    const listCallsBefore = rosterStore.list.mock.calls.length;
    const clone = await store.clone(agent as never);
    expect(clone.name).toBe('Alice copy 2');
    // Multi-leaf staleness contract: clone() must reload the shared store
    // (one list() for the name/id probe, one for the reload).
    expect(rosterStore.list.mock.calls.length).toBeGreaterThan(listCallsBefore + 1);
  });

  it('save() persists through the roster store and reloads', async () => {
    const { plugin, rosterStore } = makePlugin([agent]);
    const store = useRosterStore();
    store.init(plugin);
    await store.save(agent as never);
    expect(rosterStore.save).toHaveBeenCalledWith(agent);
    expect(rosterStore.list).toHaveBeenCalled();
  });

  it('draftNewAgent() returns an in-memory draft WITHOUT pre-saving it', async () => {
    const { plugin, rosterStore } = makePlugin([agent]);
    const store = useRosterStore();
    store.init(plugin);
    const draft = await store.draftNewAgent('New Agent');
    expect(draft.id).toBe('roster:new-agent');
    expect(draft.name).toBe('New Agent');
    expect(rosterStore.save).not.toHaveBeenCalled();
  });

  it('draftNewAgent() dedupes the id and suffixes the name when the slug is taken', async () => {
    const taken = { ...agent, id: 'roster:new-agent', name: 'New Agent' };
    const { plugin } = makePlugin([taken]);
    const store = useRosterStore();
    store.init(plugin);
    const draft = await store.draftNewAgent('New Agent');
    expect(draft.id).toBe('roster:new-agent-2');
    expect(draft.name).toBe('New Agent 2');
  });

  it('remove() deletes, clears the projection, and reloads', async () => {
    const { plugin, rosterStore } = makePlugin([agent]);
    const store = useRosterStore();
    store.init(plugin);
    await store.remove(agent as never);
    expect(rosterStore.delete).toHaveBeenCalledWith('roster:a');
    expect((plugin as { removeRosterAgentProjection: ReturnType<typeof vi.fn> }).removeRosterAgentProjection).toHaveBeenCalled();
    expect(rosterStore.list).toHaveBeenCalled();
  });

  it('remove() still reloads (dropping the card) when best-effort projection cleanup throws', async () => {
    // Root-cause guard for the "detail Delete did nothing" report: the roster
    // file is deleted BEFORE projection cleanup, so a cleanup throw must not
    // skip load() — otherwise the deleted agent's card lingers in every mounted
    // leaf even though its file is already gone (a phantom no-op).
    const { plugin, rosterStore, removeRosterAgentProjection, warn } = makePlugin([]);
    removeRosterAgentProjection.mockRejectedValueOnce(new Error('provider registry blew up'));
    const store = useRosterStore();
    store.init(plugin);
    const listCallsBefore = rosterStore.list.mock.calls.length;
    // The delete itself succeeded, so remove() resolves (does not reject) and
    // the cleanup failure is surfaced as a warning, not a failed delete.
    await expect(store.remove(agent as never)).resolves.toBeUndefined();
    expect(rosterStore.delete).toHaveBeenCalledWith('roster:a');
    expect(rosterStore.list.mock.calls.length).toBeGreaterThan(listCallsBefore);
    expect(warn).toHaveBeenCalled();
  });

  it('load() merges by identity: unchanged rows keep their reference, the changed one is new', async () => {
    const a = { ...agent, id: 'roster:a', name: 'Alice' };
    const b = { ...agent, id: 'roster:b', name: 'Bob' };
    const { plugin, rosterStore } = makePlugin([]);
    // Each list() returns FRESH clones (as a disk reload does), so identity is
    // preserved only when the store routes through mergeById.
    rosterStore.list = vi.fn()
      .mockResolvedValueOnce([{ ...a }, { ...b }])
      .mockResolvedValueOnce([{ ...a }, { ...b, name: 'Bobby' }]);
    const store = useRosterStore();
    store.init(plugin);
    await store.load();
    const [firstA, firstB] = store.agents;
    await store.load(); // mutation reload: only Bob changed
    expect(store.agents[0]).toBe(firstA); // unchanged -> same reference
    expect(store.agents[1]).not.toBe(firstB); // changed -> fresh reference
    expect(store.agents[1].name).toBe('Bobby');
  });

  it('load() rejects when the store is used before init()', async () => {
    const store = useRosterStore();
    await expect(store.load()).rejects.toThrow('used before init()');
  });
});
