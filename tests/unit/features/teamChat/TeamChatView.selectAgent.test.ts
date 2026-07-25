import { createMockEl } from '@test/helpers/mockElement';
import { Notice } from 'obsidian';

// Mock the engine so selectAgent's resolve→reuse/create flow can be exercised
// without constructing the real tab stack (mirror of TeamChatView.test).
jest.mock('@/features/chat/tabs/TabManager', () => ({
  TabManager: jest.fn().mockImplementation(() => ({
    getPersistedState: jest.fn(() => ({ openTabs: [], activeTabId: null })),
    destroy: jest.fn().mockResolvedValue(undefined),
  })),
}));

import { TeamChatView } from '@/features/teamChat/TeamChatView';

const mockNotice = Notice as jest.Mock;

/** Prototype-only view wired just enough to drive selectAgent's cross-view reuse. */
function makeView(overrides: { leaf?: unknown; plugin?: Record<string, unknown> } = {}): any {
  const view = Object.create(TeamChatView.prototype) as any;
  view.leaf = overrides.leaf ?? { id: 'leaf-this' };
  view.plugin = {
    logger: { scope: () => ({ error: jest.fn() }) },
    app: { workspace: { revealLeaf: jest.fn().mockResolvedValue(undefined) } },
    findConversationAcrossViews: jest.fn(() => null),
    getTeamChatThreadStore: jest.fn(() => ({ resolveOrCreate: jest.fn().mockResolvedValue('conv-1') })),
    ...overrides.plugin,
  };
  view.contentEl = createMockEl();
  view.tabManager = null;
  view.selectedAgentId = null;
  view.selectionGeneration = 0; // class-field initializer is skipped by Object.create
  view.tabsRestored = true;     // these flows assume a restored engine (Round-29 gate)
  view.teamChatObservers = new Set();
  return view;
}

/** A promise plus its resolver, so a test can settle resolveOrCreate on demand
 *  (to interleave a teardown / a newer select while the open is pending). */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

/** Drain all pending microtasks (to a macrotask boundary), so an awaited teardown
 *  can progress through persist into destroy() before the test resumes an open. */
function flushAsync(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('TeamChatView.selectAgent — resolve → cross-view reuse / create', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNotice.mockClear();
  });

  // Round-29 (:274): a roster click during initTabEngine's restoreState (manager
  // already non-null, tabsRestored still false) must be ignored — opening now would
  // createTab a DM restoreState is about to recreate, duplicating its controller.
  it('ignores roster clicks while restore is in progress, then opens after (:274)', async () => {
    const resolveOrCreate = jest.fn().mockResolvedValue('conv-1');
    const createTab = jest.fn().mockResolvedValue({ id: 'tab-1' });
    const view = makeView({
      plugin: {
        getTeamChatThreadStore: () => ({ resolveOrCreate }),
        findConversationAcrossViews: jest.fn(() => null),
      },
    });
    view.tabManager = { createTab, switchToTab: jest.fn() };
    view.tabsRestored = false; // restore still in flight (manager already built)

    await view.selectAgent('roster:a');

    // Bailed before touching the thread store or the engine — no tab created mid-restore.
    expect(resolveOrCreate).not.toHaveBeenCalled();
    expect(createTab).not.toHaveBeenCalled();

    // Once restore completes, selection works normally.
    view.tabsRestored = true;
    await view.selectAgent('roster:a');
    expect(resolveOrCreate).toHaveBeenCalledWith('roster:a');
    expect(createTab).toHaveBeenCalledWith('conv-1', undefined, { activate: true, kind: 'chat' });
  });

  it('does NOT set selectedAgentId optimistically — the tab projection owns it', async () => {
    const observer = jest.fn();
    const view = makeView();
    view.teamChatObservers = new Set([observer]);
    // Bare jest.fns that do NOT fire the manager's onTabCreated/onTabSwitched, so
    // nothing projects a selection during this open.
    view.tabManager = {
      createTab: jest.fn().mockResolvedValue({ id: 'tab-1' }),
      switchToTab: jest.fn(),
    };

    await view.selectAgent('roster:z');

    // Selection stays null: it is a projection of the active tab (written by the
    // engine's tab callbacks), never an optimistic write inside selectAgent.
    expect(view.selectedAgentId).toBeNull();
    expect(observer).not.toHaveBeenCalled();
  });

  it('reuses a DM already open in THIS view via a LOCAL switchToTab (no createTab)', async () => {
    const switchToTab = jest.fn().mockResolvedValue(undefined);
    const createTab = jest.fn();
    const thisLeaf = { id: 'leaf-this' };
    const view = makeView({
      leaf: thisLeaf,
      plugin: {
        getTeamChatThreadStore: () => ({ resolveOrCreate: jest.fn().mockResolvedValue('conv-1') }),
        // Same leaf ref as the host → "found in this view".
        findConversationAcrossViews: jest.fn(() => ({
          view: { leaf: thisLeaf, getTabManager: () => ({ switchToTab: jest.fn() }) },
          tabId: 'tab-1',
        })),
      },
    });
    view.tabManager = { createTab, switchToTab };

    await view.selectAgent('roster:a');

    expect(switchToTab).toHaveBeenCalledWith('tab-1');
    expect(createTab).not.toHaveBeenCalled();
  });

  it('reveals + switches in ANOTHER view when the DM is open there (never double-mounts)', async () => {
    const otherSwitch = jest.fn().mockResolvedValue(undefined);
    const otherLeaf = { id: 'leaf-other' };
    const revealLeaf = jest.fn().mockResolvedValue(undefined);
    const localSwitch = jest.fn();
    const createTab = jest.fn();
    const view = makeView({
      leaf: { id: 'leaf-this' },
      plugin: {
        app: { workspace: { revealLeaf } },
        getTeamChatThreadStore: () => ({ resolveOrCreate: jest.fn().mockResolvedValue('conv-2') }),
        findConversationAcrossViews: jest.fn(() => ({
          view: { leaf: otherLeaf, getTabManager: () => ({ switchToTab: otherSwitch }) },
          tabId: 'tab-9',
        })),
      },
    });
    view.tabManager = { createTab, switchToTab: localSwitch };

    await view.selectAgent('roster:b');

    expect(revealLeaf).toHaveBeenCalledWith(otherLeaf);
    expect(otherSwitch).toHaveBeenCalledWith('tab-9');
    expect(localSwitch).not.toHaveBeenCalled();
    expect(createTab).not.toHaveBeenCalled();
  });

  it('creates a tab locally when the DM is open in no view', async () => {
    const createTab = jest.fn().mockResolvedValue({ id: 'tab-new' });
    const view = makeView({
      plugin: {
        getTeamChatThreadStore: () => ({ resolveOrCreate: jest.fn().mockResolvedValue('conv-3') }),
        findConversationAcrossViews: jest.fn(() => null),
      },
    });
    view.tabManager = { createTab, switchToTab: jest.fn() };

    await view.selectAgent('roster:c');

    expect(createTab).toHaveBeenCalledWith('conv-3', undefined, { activate: true, kind: 'chat' });
  });

  // Fix A (Round-22) — now scoped to the CROSS-LEAF case: the per-view generation
  // guard (Round-25) handles same-view double-clicks (the second supersedes the
  // first), so the plugin-wide coordinator's job is collapsing simultaneous opens
  // of the same DM in DIFFERENT leaves (independent generation counters). One leaf
  // creates the tab; the other finds it and reveals+switches — never a duplicate.
  it('collapses simultaneous same-DM opens across leaves: createTab once, the other reveals+switches (Fix A)', async () => {
    let createdTabId: string | null = null;
    const leafA = { id: 'leaf-a' };
    const leafB = { id: 'leaf-b' };
    const revealLeaf = jest.fn().mockResolvedValue(undefined);
    // Leaf A's create registers the tab only after a yield (real latency), so B's
    // queued open can't observe it until A finishes.
    const createTabA = jest.fn().mockImplementation(async () => {
      await Promise.resolve();
      createdTabId = 'tab-1';
      return { id: 'tab-1' };
    });
    const switchA = jest.fn().mockResolvedValue(undefined);
    const createTabB = jest.fn();
    const viewA = makeView({ leaf: leafA });
    const viewB = makeView({ leaf: leafB });
    viewA.tabManager = { createTab: createTabA, switchToTab: switchA };
    viewB.tabManager = { createTab: createTabB, switchToTab: jest.fn() };
    // ONE shared plugin object → both leaves resolve the SAME DM-open coordinator
    // (it is WeakMap-keyed by plugin).
    const sharedPlugin = {
      logger: { scope: () => ({ error: jest.fn() }) },
      app: { workspace: { revealLeaf } },
      getTeamChatThreadStore: () => ({ resolveOrCreate: jest.fn().mockResolvedValue('conv-1') }),
      findConversationAcrossViews: jest.fn(() =>
        createdTabId
          ? { view: { leaf: leafA, getTabManager: () => viewA.tabManager }, tabId: createdTabId }
          : null),
    };
    viewA.plugin = sharedPlugin;
    viewB.plugin = sharedPlugin;

    await Promise.all([viewA.selectAgent('roster:a'), viewB.selectAgent('roster:a')]);

    // Exactly one create; the other leaf found the tab and revealed+switched it.
    expect(createTabA).toHaveBeenCalledTimes(1);
    expect(createTabB).not.toHaveBeenCalled();
    expect(revealLeaf).toHaveBeenCalledWith(leafA);
    expect(switchA).toHaveBeenCalledWith('tab-1');
  });

  // Round-28 (:197) — replaces the Round-25 immediate-null model with the REAL
  // teardown ordering. destroyTabRuntime does NOT null tabManager up-front; it
  // bumps the generation, then awaits persist + destroy, nulling tabManager only
  // afterwards. So an open whose resolveOrCreate settles DURING that window still
  // sees tabManager === the captured manager — only the generation bump invalidates
  // it, preventing a createTab into a manager whose tabs destroy() already
  // snapshotted (an undisposed, leaked runtime).
  it('does not createTab when destroyTabRuntime tears the leaf down mid-resolve (:197)', async () => {
    const resolveConv = deferred<string>();
    const destroyGate = deferred<void>();
    const createTab = jest.fn().mockResolvedValue({ id: 'tab-1' });
    const destroy = jest.fn(() => destroyGate.promise);
    const view = makeView({
      leaf: { id: 'leaf-this', setViewState: jest.fn().mockResolvedValue(undefined) },
      plugin: {
        getTeamChatThreadStore: () => ({ resolveOrCreate: jest.fn(() => resolveConv.promise) }),
        findConversationAcrossViews: jest.fn(() => null),
      },
    });
    view.pendingPersist = null;
    view.tabManager = {
      createTab,
      switchToTab: jest.fn(),
      getPersistedState: jest.fn(() => ({ openTabs: [], activeTabId: null })),
      destroy,
    };

    const open = view.selectAgent('roster:a'); // parks on resolveOrCreate
    const teardown = view.destroyTabRuntime();  // bumps generation, then parks on destroy()
    await flushAsync();                          // teardown reaches destroy() (tabManager still set)
    resolveConv.resolve('conv-1');               // open resumes DURING the teardown window
    await open;
    destroyGate.resolve();                       // let destroy() finish
    await teardown;

    // The generation bump at teardown start invalidated the in-flight open, so no
    // tab is mounted into the tearing-down manager.
    expect(createTab).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  // Round-25 (:209 re-entrant onOpen): the manager is REPLACED (not nulled) while
  // the open is pending — the stale open bails via the manager-identity check, and
  // must not leak into the fresh manager either.
  it('does not open into a replaced manager when the engine is swapped mid-resolve (:209)', async () => {
    const resolveConv = deferred<string>();
    const staleCreate = jest.fn().mockResolvedValue({ id: 'tab-1' });
    const view = makeView({
      plugin: {
        getTeamChatThreadStore: () => ({ resolveOrCreate: jest.fn(() => resolveConv.promise) }),
        findConversationAcrossViews: jest.fn(() => null),
      },
    });
    view.tabManager = { createTab: staleCreate, switchToTab: jest.fn() };

    const pending = view.selectAgent('roster:a');
    const freshCreate = jest.fn();
    view.tabManager = { createTab: freshCreate, switchToTab: jest.fn() }; // re-entrant onOpen
    resolveConv.resolve('conv-1');
    await pending;

    expect(staleCreate).not.toHaveBeenCalled(); // detached manager untouched
    expect(freshCreate).not.toHaveBeenCalled(); // this open was for the OLD manager
  });

  // Round-25 (:209 superseded): two selects for DIFFERENT agents where the FIRST's
  // resolveOrCreate settles LAST — the superseded first must not open; only the
  // latest selection acts.
  it('a superseded selection does not open after a newer select landed first (:209)', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const createTab = jest.fn().mockResolvedValue({ id: 'tab-new' });
    const view = makeView({
      plugin: {
        getTeamChatThreadStore: () => ({
          resolveOrCreate: jest.fn((agentId: string) =>
            agentId === 'roster:a' ? first.promise : second.promise),
        }),
        findConversationAcrossViews: jest.fn(() => null),
      },
    });
    view.tabManager = { createTab, switchToTab: jest.fn() };

    const a = view.selectAgent('roster:a'); // generation 1
    const b = view.selectAgent('roster:b'); // generation 2 (latest)
    second.resolve('conv-b'); // latest lands first
    first.resolve('conv-a');  // superseded settles last
    await Promise.all([a, b]);

    // Only the latest selection opened; the stale first bailed after resolveOrCreate.
    expect(createTab).toHaveBeenCalledTimes(1);
    expect(createTab).toHaveBeenCalledWith('conv-b', undefined, { activate: true, kind: 'chat' });
  });

  // Round-24 (replaces Round-22 Fix B manual rollback): the source leaf never
  // opened a tab for this agent (the DM lives in another leaf), and selectedAgentId
  // now projects off THIS leaf's own active tab — so it simply stays put, no manual
  // rollback. The destination leaf projects its own selection via its onTabSwitched.
  it('cross-leaf reveal leaves THIS leaf selection untouched + no local createTab', async () => {
    const observer = jest.fn();
    const otherSwitch = jest.fn().mockResolvedValue(undefined);
    const otherLeaf = { id: 'leaf-other' };
    const revealLeaf = jest.fn().mockResolvedValue(undefined);
    const createTab = jest.fn();
    const view = makeView({
      leaf: { id: 'leaf-this' },
      plugin: {
        app: { workspace: { revealLeaf } },
        getTeamChatThreadStore: () => ({ resolveOrCreate: jest.fn().mockResolvedValue('conv-2') }),
        findConversationAcrossViews: jest.fn(() => ({
          view: { leaf: otherLeaf, getTabManager: () => ({ switchToTab: otherSwitch }) },
          tabId: 'tab-9',
        })),
      },
    });
    view.selectedAgentId = 'roster:prev'; // this leaf is showing its own DM
    view.teamChatObservers = new Set([observer]);
    view.tabManager = { createTab, switchToTab: jest.fn() };

    await view.selectAgent('roster:new');

    // The owning leaf is revealed + switched; this leaf never double-mounts.
    expect(revealLeaf).toHaveBeenCalledWith(otherLeaf);
    expect(otherSwitch).toHaveBeenCalledWith('tab-9');
    expect(createTab).not.toHaveBeenCalled();
    // No manual rollback and no optimistic set: selectedAgentId is unchanged and
    // never re-emitted from selectAgent.
    expect(view.selectedAgentId).toBe('roster:prev');
    expect(observer).not.toHaveBeenCalled();
  });

  it('shows a Notice on the tab cap and leaves selection to the projection (no manual revert)', async () => {
    const observer = jest.fn();
    const createTab = jest.fn().mockResolvedValue(null); // tab cap reached
    const view = makeView({
      plugin: {
        getTeamChatThreadStore: () => ({ resolveOrCreate: jest.fn().mockResolvedValue('conv-4') }),
        findConversationAcrossViews: jest.fn(() => null),
      },
    });
    view.selectedAgentId = 'roster:prev'; // a DM was already showing
    view.teamChatObservers = new Set([observer]);
    view.tabManager = { createTab, switchToTab: jest.fn() };

    await view.selectAgent('roster:new');

    // No tab opened → nothing activated → the projection never fired, so selection
    // stays exactly where it was (there was no optimistic set to revert).
    expect(view.selectedAgentId).toBe('roster:prev');
    expect(observer).not.toHaveBeenCalled();
    // The user is still told why nothing opened.
    expect(mockNotice).toHaveBeenCalledTimes(1);
  });

  // Round-24 (:208): a THROWN resolve/persist/create used to strand the roster on
  // the just-clicked agent (optimistic set + log-only wrapper). With selection now
  // a projection of the active tab, a thrown open can't move it.
  it('leaves selectedAgentId unchanged when resolveOrCreate throws (:208)', async () => {
    const view = makeView({
      plugin: {
        getTeamChatThreadStore: () => ({ resolveOrCreate: jest.fn().mockRejectedValue(new Error('resolve boom')) }),
        findConversationAcrossViews: jest.fn(() => null),
      },
    });
    view.selectedAgentId = 'roster:current'; // reflects the real active tab
    view.tabManager = { createTab: jest.fn(), switchToTab: jest.fn() };

    await expect(view.selectAgent('roster:new')).rejects.toThrow('resolve boom');

    expect(view.selectedAgentId).toBe('roster:current');
  });

  it('leaves selectedAgentId unchanged when createTab throws (:208)', async () => {
    const createTab = jest.fn().mockRejectedValue(new Error('create boom'));
    const view = makeView({
      plugin: {
        getTeamChatThreadStore: () => ({ resolveOrCreate: jest.fn().mockResolvedValue('conv-x') }),
        findConversationAcrossViews: jest.fn(() => null),
      },
    });
    view.selectedAgentId = 'roster:current';
    view.tabManager = { createTab, switchToTab: jest.fn() };

    await expect(view.selectAgent('roster:new')).rejects.toThrow('create boom');

    expect(view.selectedAgentId).toBe('roster:current');
  });
});
