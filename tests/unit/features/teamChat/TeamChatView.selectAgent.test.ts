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
import { t } from '@/i18n/i18n';

const mockNotice = Notice as jest.Mock;

/** Prototype-only view wired just enough to drive selectAgent's cross-view reuse. */
function makeView(overrides: { leaf?: unknown; plugin?: Record<string, unknown> } = {}): any {
  const view = Object.create(TeamChatView.prototype) as any;
  view.leaf = overrides.leaf ?? { id: 'leaf-this' };
  view.plugin = {
    logger: { scope: () => ({ error: jest.fn() }) },
    app: { workspace: { revealLeaf: jest.fn().mockResolvedValue(undefined) } },
    findConversationAcrossViews: jest.fn(() => null),
    getTeamChatThreadStore: jest.fn(() => ({ get: jest.fn().mockResolvedValue(null), resolveOrCreate: jest.fn().mockResolvedValue('conv-1') })),
    ...overrides.plugin,
  };
  view.contentEl = createMockEl();
  view.tabManager = null;
  view.selectedAgentId = null;
  view.selectionGeneration = 0; // class-field initializer is skipped by Object.create
  view.selectionOpenTail = { tail: Promise.resolve() }; // ditto — the per-leaf open+reconcile tail (Round-49)
  view.dmRecency = [];          // ditto — the LRU recency array (T7)
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
        getTeamChatThreadStore: () => ({ get: jest.fn().mockResolvedValue(null), resolveOrCreate }),
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
    expect(createTab).toHaveBeenCalledWith('conv-1', undefined, { activate: true, kind: 'chat', bypassTabLimit: true });
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
        getTeamChatThreadStore: () => ({ get: jest.fn().mockResolvedValue(null), resolveOrCreate: jest.fn().mockResolvedValue('conv-1') }),
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
        getTeamChatThreadStore: () => ({ get: jest.fn().mockResolvedValue(null), resolveOrCreate: jest.fn().mockResolvedValue('conv-2') }),
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
        getTeamChatThreadStore: () => ({ get: jest.fn().mockResolvedValue(null), resolveOrCreate: jest.fn().mockResolvedValue('conv-3') }),
        findConversationAcrossViews: jest.fn(() => null),
      },
    });
    view.tabManager = { createTab, switchToTab: jest.fn() };

    await view.selectAgent('roster:c');

    expect(createTab).toHaveBeenCalledWith('conv-3', undefined, { activate: true, kind: 'chat', bypassTabLimit: true });
  });

  // T7: with the hot-DM budget full, opening a NEW agent's DM evicts the least-recently-used
  // one (never the active or the one being opened) so a big roster browses gracefully instead
  // of dead-ending at the cap. The evicted DM's mapping persists, so re-selecting reopens it.
  it('evicts the LRU DM when opening a new one would exceed maxTeamChatDms (T7)', async () => {
    const closeTab = jest.fn().mockResolvedValue(true);
    const createTab = jest.fn().mockResolvedValue({ id: 'tab-3' });
    const emit = jest.fn();
    const view = makeView({
      plugin: {
        settings: { maxTeamChatDms: 2 },
        events: { emit },
        getTeamChatThreadStore: () => ({ get: jest.fn().mockResolvedValue(null), resolveOrCreate: jest.fn().mockResolvedValue('conv-3') }),
        findConversationAcrossViews: jest.fn(() => null), // conv-3 open in no leaf → create path
      },
    });
    // Two DMs already open (at budget). conv-2 is active/most-recent; conv-1 is the LRU.
    view.dmRecency = ['conv-1', 'conv-2'];
    view.tabManager = {
      createTab,
      switchToTab: jest.fn(),
      getAllTabs: jest.fn(() => [{ id: 'tab-1', conversationId: 'conv-1' }, { id: 'tab-2', conversationId: 'conv-2' }]),
      getActiveTabId: jest.fn(() => 'tab-2'),
      closeTab,
    };

    await view.selectAgent('roster:c');

    // The LRU DM (conv-1 / tab-1) is force-closed to free a slot, presence re-broadcast...
    expect(closeTab).toHaveBeenCalledWith('tab-1', true);
    expect(emit).toHaveBeenCalledWith('teamChat:presence');
    // ...then the new DM opens (bypassing the shared maxChatTabs — Team Chat's budget is its own).
    expect(createTab).toHaveBeenCalledWith('conv-3', undefined, { activate: true, kind: 'chat', bypassTabLimit: true });
  });

  // T7 composes with the Round-25 stale guard: a selection superseded before it opens must
  // not evict anything (nor create) — only the latest selection acts.
  it('does not evict when the selection was superseded before opening (T7)', async () => {
    const closeTab = jest.fn();
    const createTab = jest.fn().mockResolvedValue({ id: 'tab-3' });
    const resolveGate = deferred<string>();
    const view = makeView({
      plugin: {
        settings: { maxTeamChatDms: 2 },
        events: { emit: jest.fn() },
        getTeamChatThreadStore: () => ({ get: jest.fn().mockResolvedValue(null), resolveOrCreate: () => resolveGate.promise }),
        findConversationAcrossViews: jest.fn(() => null),
      },
    });
    view.dmRecency = ['conv-1', 'conv-2'];
    view.tabManager = {
      createTab,
      switchToTab: jest.fn(),
      getAllTabs: jest.fn(() => [{ id: 'tab-1', conversationId: 'conv-1' }, { id: 'tab-2', conversationId: 'conv-2' }]),
      getActiveTabId: jest.fn(() => 'tab-2'),
      closeTab,
    };

    const open = view.selectAgent('roster:c'); // parks on resolveOrCreate
    view.selectionGeneration++;                 // a newer select supersedes this one
    resolveGate.resolve('conv-3');
    await open;

    // Superseded → bailed at the stale check before touching the engine: no eviction, no create.
    expect(closeTab).not.toHaveBeenCalled();
    expect(createTab).not.toHaveBeenCalled();
  });

  // Round-49: two rapid roster clicks on DIFFERENT agents at full budget. Their conversationIds
  // differ, so the per-conversationId open coordinator does NOT collapse them — before the per-leaf
  // tail they raced: both evictions read getAllTabs and force-closed the SAME LRU victim (the second
  // close returns false), the second selection reported the cap without opening, and neither opened
  // while the victim stayed evicted. `selectionOpenTail` makes the second open wait for the first to
  // fully settle, so it sees the slot the first freed and opens cleanly — one close, only the latest
  // agent opens, no cap Notice, budget preserved.
  it('serializes overlapping different-agent selections so neither double-evicts at full budget (Round-49)', async () => {
    const closeGate = deferred<void>();
    const closing = new Set<string>();
    const tabs = [
      { id: 'tab-1', conversationId: 'conv-1', state: { isStreaming: false } }, // idle LRU victim
      { id: 'tab-2', conversationId: 'conv-2', state: { isStreaming: false } }, // active
    ];
    let firstClose = true;
    const closeTab = jest.fn(async (tabId: string) => {
      if (closing.has(tabId)) return false;                                  // a concurrent close of the same tab frees nothing (real TabManager)
      closing.add(tabId);
      if (firstClose) { firstClose = false; await closeGate.promise; }       // park the FIRST eviction close so the second selection can queue behind it
      const index = tabs.findIndex((tab) => tab.id === tabId);
      closing.delete(tabId);
      if (index < 0) return false;
      tabs.splice(index, 1);
      return true;
    });
    const created: string[] = [];
    const createTab = jest.fn(async (conversationId: string) => {
      created.push(conversationId);
      tabs.push({ id: `tab-${conversationId}`, conversationId, state: { isStreaming: false } });
      return { id: `tab-${conversationId}` };
    });
    const manager = {
      createTab,
      closeTab,
      switchToTab: jest.fn(),
      getAllTabs: () => tabs.slice(),
      getActiveTabId: () => 'tab-2',
    };
    const view = makeView({
      plugin: {
        settings: { maxTeamChatDms: 2 },
        events: { emit: jest.fn() },
        getTeamChatThreadStore: () => ({
          get: jest.fn().mockResolvedValue(null),
          resolveOrCreate: jest.fn((agentId: string) => Promise.resolve(agentId === 'roster:a' ? 'conv-a' : 'conv-b')),
        }),
        findConversationAcrossViews: jest.fn(() => null),
      },
    });
    view.dmRecency = ['conv-1', 'conv-2'];
    view.tabManager = manager;

    const a = view.selectAgent('roster:a'); // generation 1 — enters its open body, parks on the eviction close
    await flushAsync();                     // let A reach the gated close of the LRU victim (tab-1)
    const b = view.selectAgent('roster:b'); // generation 2 — queued behind A on the per-leaf tail
    await flushAsync();                     // B cannot proceed: A still owns the tail

    // Serialization: B's open body has NOT started while A is parked — no second close, no create, no cap Notice.
    expect(closeTab).toHaveBeenCalledTimes(1);
    expect(createTab).not.toHaveBeenCalled();
    expect(mockNotice).not.toHaveBeenCalled();

    closeGate.resolve();                    // A's eviction completes; A is now superseded (gen 2) so it does NOT open
    await Promise.all([a, b]);

    // Only the latest agent opened, reusing the slot A freed — exactly one eviction, no cap Notice,
    // and the manager never dipped below budget via a wasted double-close.
    expect(createTab).toHaveBeenCalledTimes(1);
    expect(createTab).toHaveBeenCalledWith('conv-b', undefined, { activate: true, kind: 'chat', bypassTabLimit: true });
    expect(closeTab).toHaveBeenCalledTimes(1);
    expect(closeTab).toHaveBeenCalledWith('tab-1', true);
    expect(mockNotice).not.toHaveBeenCalled();
    expect(tabs).toHaveLength(2);
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
      getTeamChatThreadStore: () => ({ get: jest.fn().mockResolvedValue(null), resolveOrCreate: jest.fn().mockResolvedValue('conv-1') }),
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
        getTeamChatThreadStore: () => ({ get: jest.fn().mockResolvedValue(null), resolveOrCreate: jest.fn(() => resolveConv.promise) }),
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
        getTeamChatThreadStore: () => ({ get: jest.fn().mockResolvedValue(null), resolveOrCreate: jest.fn(() => resolveConv.promise) }),
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
          get: jest.fn().mockResolvedValue(null),
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
    expect(createTab).toHaveBeenCalledWith('conv-b', undefined, { activate: true, kind: 'chat', bypassTabLimit: true });
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
        getTeamChatThreadStore: () => ({ get: jest.fn().mockResolvedValue(null), resolveOrCreate: jest.fn().mockResolvedValue('conv-2') }),
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
        getTeamChatThreadStore: () => ({ get: jest.fn().mockResolvedValue(null), resolveOrCreate: jest.fn().mockResolvedValue('conv-4') }),
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
        getTeamChatThreadStore: () => ({ get: jest.fn().mockResolvedValue(null), resolveOrCreate: jest.fn().mockRejectedValue(new Error('resolve boom')) }),
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
        getTeamChatThreadStore: () => ({ get: jest.fn().mockResolvedValue(null), resolveOrCreate: jest.fn().mockResolvedValue('conv-x') }),
        findConversationAcrossViews: jest.fn(() => null),
      },
    });
    view.selectedAgentId = 'roster:current';
    view.tabManager = { createTab, switchToTab: jest.fn() };

    await expect(view.selectAgent('roster:new')).rejects.toThrow('create boom');

    expect(view.selectedAgentId).toBe('roster:current');
  });

  // Round-30 (:283): a provider change rotates the mapping to a FRESH conversation
  // (resolveOrCreate returns a new id). selectAgent opens the new DM and must close
  // the OLD-provider tab it left behind (cross-leaf), freeing its slot.
  it('closes the old-provider DM tab when a provider change rotates the conversation (:283)', async () => {
    let newTabOpen = false;
    const get = jest.fn().mockResolvedValue('conv-old');            // currently mapped (old provider)
    const resolveOrCreate = jest.fn().mockResolvedValue('conv-new'); // rotated to a fresh conversation
    const createTab = jest.fn().mockImplementation(async () => { newTabOpen = true; return { id: 'tab-new' }; });
    const closeOldTab = jest.fn().mockResolvedValue(true);
    const otherLeaf = { id: 'leaf-other' };
    const view = makeView({
      leaf: { id: 'leaf-this' },
      plugin: {
        agentRosterStore: { get: jest.fn().mockResolvedValue({ name: 'Ada' }) },
        events: { emit: jest.fn() }, // closeTeamChatDmTab broadcasts presence on the force-close (T7 :168)
        getTeamChatThreadStore: () => ({ get, resolveOrCreate }),
        findConversationAcrossViews: jest.fn((id: string) => {
          // The new DM registers only after createTab runs; the old DM lives in another leaf.
          if (id === 'conv-new') {
            return newTabOpen
              ? { view: { leaf: { id: 'leaf-this' }, getTabManager: () => ({ switchToTab: jest.fn() }) }, tabId: 'tab-new' }
              : null;
          }
          if (id === 'conv-old') {
            return { view: { leaf: otherLeaf, getTabManager: () => ({ closeTab: closeOldTab }) }, tabId: 'tab-old' };
          }
          return null;
        }),
      },
    });
    view.tabManager = { createTab, switchToTab: jest.fn() };

    await view.selectAgent('roster:a');

    // New DM opened; the orphaned old-provider tab force-closed in its owning leaf.
    expect(createTab).toHaveBeenCalledWith('conv-new', undefined, { activate: true, kind: 'chat', bypassTabLimit: true });
    expect(closeOldTab).toHaveBeenCalledWith('tab-old', true);
    // Fix 3 (:361): the rotation notice is emitted BEFORE the old tab is closed.
    expect(mockNotice).toHaveBeenCalledWith(t('teamChat.providerRotated', { agent: 'Ada' }));
    expect(mockNotice.mock.invocationCallOrder[0]).toBeLessThan(closeOldTab.mock.invocationCallOrder[0]);
  });

  it('closes nothing when there is no rotation (mapping unchanged) (:283)', async () => {
    let tabOpen = false;
    const get = jest.fn().mockResolvedValue('conv-1');             // mapped == resolved → no rotation
    const resolveOrCreate = jest.fn().mockResolvedValue('conv-1');
    const createTab = jest.fn().mockImplementation(async () => { tabOpen = true; return { id: 'tab-1' }; });
    const closeTab = jest.fn();
    const view = makeView({
      plugin: {
        getTeamChatThreadStore: () => ({ get, resolveOrCreate }),
        findConversationAcrossViews: jest.fn((id: string) =>
          id === 'conv-1' && tabOpen
            ? { view: { leaf: { id: 'x' }, getTabManager: () => ({ closeTab }) }, tabId: 'tab-1' }
            : null),
      },
    });
    view.tabManager = { createTab, switchToTab: jest.fn() };

    await view.selectAgent('roster:a');

    expect(createTab).toHaveBeenCalledWith('conv-1', undefined, { activate: true, kind: 'chat', bypassTabLimit: true });
    expect(closeTab).not.toHaveBeenCalled(); // no rotation → nothing to close
  });

  // Round-48 Fix A (:405): after a reload, the displaced old-provider tab (conv-old) is still open +
  // persisted, but the store mapping already rotated to conv-new pre-reload. The restore reconcile
  // re-selects the agent with an EXPLICIT displacedConversationId (conv-old, the mismatched tab's own
  // id). selectAgent must close conv-old and reuse ITS slot — never evicting the unrelated hot DM —
  // and must NOT re-fire the rotation notice (get() === resolveOrCreate(), so no fresh rotation).
  it('closes the explicitly-displaced tab and reuses its slot on a reload-cleanup re-select (Fix A)', async () => {
    let newTabOpen = false;
    const get = jest.fn().mockResolvedValue('conv-new');            // store already rotated pre-reload
    const resolveOrCreate = jest.fn().mockResolvedValue('conv-new'); // usable → no fresh rotation this pass
    const createTab = jest.fn().mockImplementation(async () => { newTabOpen = true; return { id: 'tab-new' }; });
    const closeOldTab = jest.fn().mockResolvedValue(true);
    const unrelatedClose = jest.fn().mockResolvedValue(true);
    const otherLeaf = { id: 'leaf-other' };
    const view = makeView({
      leaf: { id: 'leaf-this' },
      plugin: {
        settings: { maxTeamChatDms: 2 },
        events: { emit: jest.fn() },
        getTeamChatThreadStore: () => ({ get, resolveOrCreate }),
        findConversationAcrossViews: jest.fn((id: string) => {
          if (id === 'conv-new') {
            return newTabOpen
              ? { view: { leaf: { id: 'leaf-this' }, getTabManager: () => ({ switchToTab: jest.fn() }) }, tabId: 'tab-new' }
              : null;
          }
          if (id === 'conv-old') return { view: { leaf: otherLeaf, getTabManager: () => ({ closeTab: closeOldTab }) }, tabId: 'tab-old' };
          return null;
        }),
      },
    });
    // At budget (2): the displaced old-provider DM (conv-old) + one unrelated hot DM (conv-hot).
    view.dmRecency = ['conv-old', 'conv-hot'];
    view.tabManager = {
      createTab,
      switchToTab: jest.fn(),
      getAllTabs: jest.fn(() => [
        { id: 'tab-old', conversationId: 'conv-old', state: { isStreaming: false } },
        { id: 'tab-hot', conversationId: 'conv-hot', state: { isStreaming: false } },
      ]),
      getActiveTabId: jest.fn(() => 'tab-hot'),
      closeTab: unrelatedClose,
    };

    await view.selectAgent('roster:a', { displacedConversationId: 'conv-old' });

    // conv-new opened reusing conv-old's slot — the unrelated hot DM (tab-hot) is NOT evicted.
    expect(createTab).toHaveBeenCalledWith('conv-new', undefined, { activate: true, kind: 'chat', bypassTabLimit: true });
    expect(unrelatedClose).not.toHaveBeenCalled();
    // The lingering displaced old-provider tab IS force-closed cross-leaf, freeing its stale runtime.
    expect(closeOldTab).toHaveBeenCalledWith('tab-old', true);
    // No duplicate rotation notice — the mapping did not change on this pass.
    expect(mockNotice).not.toHaveBeenCalled();
  });
});

// Round-48 Fix C (:400): a roster click while tabs are still restoring used to be permanently
// discarded (selectAgent early-returned). Now the latest such click is queued and drained once
// restore completes, so selecting an agent absent from the saved layout no longer appears to do nothing.
describe('TeamChatView.selectAgent — queued restore-time selection (Round-48 Fix C)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNotice.mockClear();
  });

  it('queues the agent and does NOT open while tabs are still restoring', async () => {
    const resolveOrCreate = jest.fn().mockResolvedValue('conv-1');
    const createTab = jest.fn();
    const view = makeView({
      plugin: {
        getTeamChatThreadStore: () => ({ get: jest.fn().mockResolvedValue(null), resolveOrCreate }),
        findConversationAcrossViews: jest.fn(() => null),
      },
    });
    view.tabManager = { createTab, switchToTab: jest.fn() };
    view.tabsRestored = false;
    view.pendingAgentSelection = null;

    await view.selectAgent('roster:late');

    // Retained for after restore instead of discarded — and nothing opened mid-restore.
    expect(view.pendingAgentSelection).toBe('roster:late');
    expect(resolveOrCreate).not.toHaveBeenCalled();
    expect(createTab).not.toHaveBeenCalled();
  });

  it('keeps only the LAST agent clicked during restore (last-click-wins)', async () => {
    const view = makeView();
    view.tabManager = { createTab: jest.fn(), switchToTab: jest.fn() };
    view.tabsRestored = false;
    view.pendingAgentSelection = null;

    await view.selectAgent('roster:first');
    await view.selectAgent('roster:second');

    expect(view.pendingAgentSelection).toBe('roster:second');
  });

  it('still bails (no queue) when there is no engine at all', async () => {
    const view = makeView();
    view.tabManager = null;
    view.tabsRestored = false;
    view.pendingAgentSelection = null;

    await view.selectAgent('roster:x');

    // No manager → the click can't be honored later either, so it is not queued.
    expect(view.pendingAgentSelection).toBeNull();
  });

  // Round-50 (second-order of Fix C): a REAL (post-restore) selection that proceeds must clear any
  // restore-time pick still queued, so the post-reconcile drain can't replay that stale pick over
  // the newer one. Without the clear, a click during the reconcile await would be clobbered by the
  // drain replaying the older queued agent — violating last-click-wins.
  it('a proceeding (post-restore) selection clears a queued restore-time pick — last-click-wins (Round-50)', async () => {
    const createTab = jest.fn().mockResolvedValue({ id: 'tab-c' });
    const view = makeView({
      plugin: {
        getTeamChatThreadStore: () => ({ get: jest.fn().mockResolvedValue(null), resolveOrCreate: jest.fn().mockResolvedValue('conv-c') }),
        findConversationAcrossViews: jest.fn(() => null),
      },
    });
    view.tabManager = { createTab, switchToTab: jest.fn() };
    view.tabsRestored = true;
    view.pendingAgentSelection = 'roster:stale'; // an earlier restore-time click, still queued

    await view.selectAgent('roster:c');

    // C opened, and it superseded the queued restore-time pick so a later drain sees null.
    expect(createTab).toHaveBeenCalledWith('conv-c', undefined, { activate: true, kind: 'chat', bypassTabLimit: true });
    expect(view.pendingAgentSelection).toBeNull();
  });
});
