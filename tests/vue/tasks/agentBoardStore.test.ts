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

function makePlugin(folder = 'Agent Board/tasks') {
  return { app: { vault: {} }, settings: { agentBoardWorkOrderFolder: folder } };
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
