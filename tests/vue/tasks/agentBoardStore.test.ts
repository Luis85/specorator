import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ResolvedBoardLayout, ResolvedLane } from '@/features/tasks/config/boardConfigTypes';
import type { TaskSpec, TaskStatus } from '@/features/tasks/model/taskTypes';
import { type BoardLoaderDeps, useAgentBoardStore } from '@/features/tasks/ui/vue/stores/agentBoardStore';

function makeTask(id: string, status: TaskStatus = 'ready'): TaskSpec {
  return {
    path: `Agent Board/tasks/${id}.md`,
    frontmatter: {
      type: 'specorator-work-order', schema_version: 1, id, title: id, status,
      priority: '2 - normal', created: '', updated: '', attempts: 0,
    },
    sections: { objective: '', acceptanceCriteria: '', context: '', constraints: '', ledger: '', handoff: '' },
    body: '', raw: '',
  } as TaskSpec;
}

function makeLane(id: string, tasks: TaskSpec[]): ResolvedLane {
  return {
    id, title: id, tasks,
    hostsNewWorkOrders: false, definitionOfReady: [], definitionOfDone: [],
    isCatchAll: false, collapsible: false, collapsed: false,
  };
}

/**
 * Minimal plugin seam the store's toolbar-state projection reads: getTabSlotUsage
 * (chat-tab badge) + the shared queueControl/queueSlotTracker singletons. Defaults
 * mirror a fresh, paused plugin; `toolbar` overrides drive the projection tests.
 */
function makePlugin(
  folder = 'Agent Board/tasks',
  toolbar: {
    slots?: { used: number; max: number };
    occupied?: number;
    capacity?: number;
    queue?: Partial<{ paused: boolean; halted: boolean; haltReason: string | null; consecutiveFailures: number }>;
  } = {},
) {
  const slots = toolbar.slots ?? { used: 0, max: 3 };
  return {
    app: { vault: {} },
    settings: { agentBoardWorkOrderFolder: folder },
    getTabSlotUsage: () => slots,
    queueControl: { paused: true, halted: false, haltReason: null, consecutiveFailures: 0, ...toolbar.queue },
    queueSlotTracker: { occupied: () => toolbar.occupied ?? 0, capacity: () => toolbar.capacity ?? slots.max },
  };
}

/**
 * Loader seam: a scripted sequence of layouts, one per load() call. Keeps the
 * store a pure projection in the test — no real TaskIndexer / vault / config
 * parsing. `folders` records what folder each index pass asked for so a test
 * can assert the store reads the real setting key.
 */
function makeDeps(layouts: ResolvedBoardLayout[]): { deps: BoardLoaderDeps; folders: string[] } {
  const folders: string[] = [];
  let call = 0;
  const deps: BoardLoaderDeps = {
    indexVaultFolder: (_vault, folder) => {
      folders.push(folder);
      return Promise.resolve({ tasks: [], invalidNotes: [] });
    },
    loadBoardConfig: vi.fn(() => ({ config: {}, errors: [] })) as unknown as BoardLoaderDeps['loadBoardConfig'],
    resolveBoardLayout: vi.fn(
      () => layouts[Math.min(call++, layouts.length - 1)],
    ) as unknown as BoardLoaderDeps['resolveBoardLayout'],
  };
  return { deps, folders };
}

function initStore(layouts: ResolvedBoardLayout[], plugin = makePlugin()) {
  const store = useAgentBoardStore();
  const { deps, folders } = makeDeps(layouts);
  store.init(plugin as never, deps);
  return { store, folders };
}

describe('useAgentBoardStore', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('load() projects lanes with their tasks from the resolved layout', async () => {
    const ready = makeLane('ready', [makeTask('t1'), makeTask('t2')]);
    const running = makeLane('running', [makeTask('t3', 'running')]);
    const layout: ResolvedBoardLayout = { lanes: [ready, running], errors: ['oops'] };
    const { store, folders } = initStore([layout]);

    await store.load();

    expect(store.layout.lanes.map((l) => l.id)).toEqual(['ready', 'running']);
    expect(store.layout.lanes[0].tasks.map((t) => t.frontmatter.id)).toEqual(['t1', 't2']);
    expect(store.layout.lanes[1].tasks[0].frontmatter.status).toBe('running');
    expect(store.layout.errors).toEqual(['oops']);
    // Reads the REAL folder setting key (agentBoardWorkOrderFolder), not `agentBoardFolder`.
    expect(folders).toEqual(['Agent Board/tasks']);
    expect(store.loading).toBe(false);
  });

  it('merges loadBoardConfig parse warnings ahead of resolveBoardLayout errors', async () => {
    // Malformed persisted board settings (duplicate lane ids / status mappings)
    // surface as loadBoardConfig warnings; the imperative view appended them to
    // layout.errors so the Board notices section explained the fallback lanes.
    // The store must preserve them, config warnings first (parity with
    // AgentBoardView.refresh: [...configErrors, ...layout.errors]).
    const store = useAgentBoardStore();
    const deps: BoardLoaderDeps = {
      indexVaultFolder: () => Promise.resolve({ tasks: [], invalidNotes: [] }),
      loadBoardConfig: vi.fn(() => ({ config: {}, errors: ['dup lane id "ready"'] })) as unknown as BoardLoaderDeps['loadBoardConfig'],
      resolveBoardLayout: vi.fn(() => ({ lanes: [], errors: ['unsorted status'] })) as unknown as BoardLoaderDeps['resolveBoardLayout'],
    };
    store.init(makePlugin() as never, deps);

    await store.load();

    expect(store.layout.errors).toEqual(['dup lane id "ready"', 'unsorted status']);
  });

  it('slots/queueState carry a pre-load default (empty slots, null queue) until the first load', () => {
    const store = useAgentBoardStore();
    expect(store.slots).toEqual({ used: 0, max: 0 });
    expect(store.queueState).toBeNull();
  });

  it('load() projects slots (getTabSlotUsage) + queueState (shared control + slot tracker)', async () => {
    const plugin = makePlugin('Agent Board/tasks', {
      slots: { used: 2, max: 3 },
      occupied: 1,
      capacity: 3,
      queue: { paused: false, halted: false, haltReason: null, consecutiveFailures: 0 },
    });
    const { store } = initStore([{ lanes: [], errors: [] }], plugin);

    await store.load();

    expect(store.slots).toEqual({ used: 2, max: 3 });
    expect(store.queueState).toEqual({
      paused: false,
      halted: false,
      haltReason: null,
      slotOccupied: 1,
      slotCapacity: 3,
      consecutiveFailures: 0,
    });
  });

  it('load() projects a halted queue (reason + failure streak) for the toolbar halt caption', async () => {
    const plugin = makePlugin('Agent Board/tasks', {
      queue: { paused: false, halted: true, haltReason: '3 consecutive failures', consecutiveFailures: 3 },
    });
    const { store } = initStore([{ lanes: [], errors: [] }], plugin);

    await store.load();

    expect(store.queueState).toMatchObject({ halted: true, haltReason: '3 consecutive failures', consecutiveFailures: 3 });
  });

  it('load() refreshes slots/queueState even when the vault index rejects (parity: refreshSlots never gates on the index)', async () => {
    const store = useAgentBoardStore();
    const plugin = makePlugin('Agent Board/tasks', { slots: { used: 1, max: 4 }, occupied: 1, capacity: 4 });
    const deps: BoardLoaderDeps = {
      indexVaultFolder: () => Promise.reject(new Error('vault boom')),
      loadBoardConfig: vi.fn(() => ({ config: {}, errors: [] })) as unknown as BoardLoaderDeps['loadBoardConfig'],
      resolveBoardLayout: vi.fn() as unknown as BoardLoaderDeps['resolveBoardLayout'],
    };
    store.init(plugin as never, deps);

    await store.load();

    expect(store.error).toBe('vault boom');
    // The toolbar chrome is sourced off live singletons, not the failed index.
    expect(store.slots).toEqual({ used: 1, max: 4 });
    expect(store.queueState?.slotCapacity).toBe(4);
  });

  it('load() captures the loader model invalidNotes (the "Skipped notes" surface)', async () => {
    const store = useAgentBoardStore();
    const deps: BoardLoaderDeps = {
      indexVaultFolder: () => Promise.resolve({ tasks: [], invalidNotes: [{ path: 'b.md', error: 'boom' }] }),
      loadBoardConfig: vi.fn(() => ({ config: {}, errors: [] })) as unknown as BoardLoaderDeps['loadBoardConfig'],
      resolveBoardLayout: vi.fn(() => ({ lanes: [], errors: [] })) as unknown as BoardLoaderDeps['resolveBoardLayout'],
    };
    store.init(makePlugin() as never, deps);

    await store.load();

    expect(store.invalidNotes).toEqual([{ path: 'b.md', error: 'boom' }]);
  });

  it('tick() advances nowMs to the current time (the board freshness clock)', () => {
    const { store } = initStore([{ lanes: [], errors: [] }]);
    const spy = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    store.tick();
    expect(store.nowMs).toBe(1_700_000_000_000);
    spy.mockRestore();
  });

  it('recordHeartbeat replaces the map with a NEW reference and sets the value', () => {
    const { store } = initStore([{ lanes: [], errors: [] }]);
    const before = store.liveHeartbeats;
    store.recordHeartbeat('t1', '2026-07-10T00:00:00Z');
    expect(store.liveHeartbeats).not.toBe(before);
    expect(store.liveHeartbeats.get('t1')).toBe('2026-07-10T00:00:00Z');
  });

  it('recordLedger replaces the map with a NEW reference and sets the value', () => {
    const { store } = initStore([{ lanes: [], errors: [] }]);
    const before = store.liveLedger;
    store.recordLedger('t1', 'ran a tool');
    expect(store.liveLedger).not.toBe(before);
    expect(store.liveLedger.get('t1')).toBe('ran a tool');
  });

  it('evictLive drops both live entries (new map references so a watch fires)', () => {
    const { store } = initStore([{ lanes: [], errors: [] }]);
    store.recordHeartbeat('t1', 'at');
    store.recordLedger('t1', 'msg');
    const hb = store.liveHeartbeats;
    const ledger = store.liveLedger;

    store.evictLive('t1');

    expect(store.liveHeartbeats.has('t1')).toBe(false);
    expect(store.liveLedger.has('t1')).toBe(false);
    expect(store.liveHeartbeats).not.toBe(hb);
    expect(store.liveLedger).not.toBe(ledger);
  });

  it('load() evicts a stale live overlay for a task that came back terminal (missed evict while board closed)', async () => {
    // A task is live with a heartbeat/ledger overlay, the board closes (routing
    // unsubscribes but this module-global store survives), the run finishes off
    // screen, then the board reopens and reloads with the note now terminal.
    const running = makeLane('running', [makeTask('t1', 'running')]);
    const done = makeLane('done', [makeTask('t1', 'done')]);
    const { store } = initStore([
      { lanes: [running], errors: [] },
      { lanes: [done], errors: [] },
    ]);

    await store.load();
    store.recordHeartbeat('t1', '2026-07-10T00:00:00Z');
    store.recordLedger('t1', 'ran a tool');
    const hbBefore = store.liveHeartbeats;

    await store.load(); // reopen: t1 is now terminal

    expect(store.liveHeartbeats.has('t1')).toBe(false);
    expect(store.liveLedger.has('t1')).toBe(false);
    expect(store.liveHeartbeats).not.toBe(hbBefore); // pruned → new reference
  });

  it('load() keeps a live overlay whose task is still live (no churn when nothing to prune)', async () => {
    const running = makeLane('running', [makeTask('t1', 'running')]);
    const { store } = initStore([
      { lanes: [running], errors: [] },
      { lanes: [running], errors: [] },
    ]);

    await store.load();
    store.recordHeartbeat('t1', '2026-07-10T00:00:00Z');
    const hbBefore = store.liveHeartbeats;

    await store.load(); // reload: t1 still running

    expect(store.liveHeartbeats.get('t1')).toBe('2026-07-10T00:00:00Z');
    expect(store.liveHeartbeats).toBe(hbBefore); // nothing pruned → same reference, no re-render
  });

  it('load() evicts a stale skip chip once the card leaves a runnable status (missed clear while board closed / note-edit reload)', async () => {
    // A ready card is queue-skipped (chip shows), then the note is edited off the
    // runnable status through a path that fires no task:status-changed (manual
    // edit, or a change while no pane is mounted). The next reload must drop the
    // now-orphaned chip — the runner only skips ready/needs_fix cards.
    const ready = makeLane('ready', [makeTask('t1', 'ready')]);
    const done = makeLane('done', [makeTask('t1', 'done')]);
    const { store } = initStore([
      { lanes: [ready], errors: [] },
      { lanes: [done], errors: [] },
    ]);

    await store.load();
    store.setSkip('t1', 'no free slot');
    const skipBefore = store.skipReasons;

    await store.load(); // reload: t1 is now terminal

    expect(store.skipReasons.has('t1')).toBe(false);
    expect(store.skipReasons).not.toBe(skipBefore); // pruned → new reference
  });

  it('load() keeps a skip chip while the card is still runnable (the skip event also drives a reload)', async () => {
    // Parity guard: task:queue-skipped is in FULL_REFRESH_EVENTS, so setSkip is
    // immediately followed by a load() with the card STILL ready — the reconcile
    // must not wipe the just-set chip.
    const ready = makeLane('ready', [makeTask('t1', 'ready')]);
    const needsFix = makeLane('needs_fix', [makeTask('t1', 'needs_fix')]);
    const { store } = initStore([
      { lanes: [ready], errors: [] },
      { lanes: [needsFix], errors: [] },
    ]);

    await store.load();
    store.setSkip('t1', 'no free slot');
    const skipBefore = store.skipReasons;

    await store.load(); // reload: t1 still runnable (needs_fix)

    expect(store.skipReasons.get('t1')).toBe('no free slot');
    expect(store.skipReasons).toBe(skipBefore); // nothing pruned → same reference
  });

  it('load() captures a fetch rejection into store.error, resolves (never throws), and leaves layout unchanged', async () => {
    const store = useAgentBoardStore();
    const deps: BoardLoaderDeps = {
      indexVaultFolder: () => Promise.reject(new Error('vault boom')),
      loadBoardConfig: vi.fn(() => ({ config: {}, errors: [] })) as unknown as BoardLoaderDeps['loadBoardConfig'],
      resolveBoardLayout: vi.fn() as unknown as BoardLoaderDeps['resolveBoardLayout'],
    };
    store.init(makePlugin() as never, deps);
    const layoutBefore = store.layout;

    // Must resolve, not reject — the composable fires `void store.load()` off a
    // vault-delete/rename burst and cannot handle a rejection.
    await expect(store.load()).resolves.toBeUndefined();

    expect(store.error).toBe('vault boom');
    expect(store.layout).toBe(layoutBefore);
    expect(store.loading).toBe(false);
  });

  it('setPause replaces the map with a NEW reference and stores the payload', () => {
    const { store } = initStore([{ lanes: [], errors: [] }]);
    const before = store.pauseState;
    store.setPause('t1', { question: 'Q?', runId: 'r1' });
    expect(store.pauseState).not.toBe(before);
    expect(store.pauseState.get('t1')).toEqual({ question: 'Q?', runId: 'r1' });
  });

  it('clearPause removes the entry (new reference so a shallowRef watch fires)', () => {
    const { store } = initStore([{ lanes: [], errors: [] }]);
    store.setPause('t1', { action: 'A', risk: 'R', runId: 'r1' });
    const before = store.pauseState;
    store.clearPause('t1');
    expect(store.pauseState).not.toBe(before);
    expect(store.pauseState.has('t1')).toBe(false);
  });

  it('clearPause on an absent key is a no-op that does not churn the reference (mirrors evictLive)', () => {
    const { store } = initStore([{ lanes: [], errors: [] }]);
    const before = store.pauseState;
    store.clearPause('missing');
    expect(store.pauseState).toBe(before);
  });

  it('setSkip replaces the map with a NEW reference and stores the reason (reactive skip chip)', () => {
    const { store } = initStore([{ lanes: [], errors: [] }]);
    const before = store.skipReasons;
    store.setSkip('t1', 'no free slot');
    expect(store.skipReasons).not.toBe(before);
    expect(store.skipReasons.get('t1')).toBe('no free slot');
  });

  it('clearSkip removes the entry (new reference so a shallowRef watch fires)', () => {
    const { store } = initStore([{ lanes: [], errors: [] }]);
    store.setSkip('t1', 'no free slot');
    const before = store.skipReasons;
    store.clearSkip('t1');
    expect(store.skipReasons).not.toBe(before);
    expect(store.skipReasons.has('t1')).toBe(false);
  });

  it('clearSkip on an absent key is a no-op that does not churn the reference', () => {
    const { store } = initStore([{ lanes: [], errors: [] }]);
    const before = store.skipReasons;
    store.clearSkip('missing');
    expect(store.skipReasons).toBe(before);
  });

  it('mergeById preserves task identity across loads (no flicker on a live board)', async () => {
    const first: ResolvedBoardLayout = { lanes: [makeLane('running', [makeTask('t1', 'running')])], errors: [] };
    // Second load: a FRESH task instance with identical content, as if re-parsed off disk.
    const second: ResolvedBoardLayout = { lanes: [makeLane('running', [makeTask('t1', 'running')])], errors: [] };
    const { store } = initStore([first, second]);

    await store.load();
    const ref1 = store.layout.lanes[0].tasks[0];
    await store.load();
    const ref2 = store.layout.lanes[0].tasks[0];

    expect(ref2).toBe(ref1);
  });
});
