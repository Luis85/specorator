import { createMockEl } from '@test/helpers/mockElement';

// Stub only vue's createApp so onOpen can run without a real Vue mount; keep the
// rest of vue real (markRaw, and pinia's internal vue usage) via requireActual.
jest.mock('vue', () => {
  const actual = jest.requireActual('vue');
  return {
    ...actual,
    createApp: jest.fn(() => ({
      use: jest.fn(),
      provide: jest.fn(),
      mount: jest.fn(),
      unmount: jest.fn(),
    })),
  };
});

// Mock the engine so the view's ChatViewHandle conformance can be exercised
// without constructing the real tab stack (controllers, runtimes, islands).
jest.mock('@/features/chat/tabs/TabManager', () => ({
  TabManager: jest.fn().mockImplementation(() => ({
    getPersistedState: jest.fn(() => ({ openTabs: [], activeTabId: null })),
    getActiveTab: jest.fn(() => null),
    restoreState: jest.fn().mockResolvedValue(undefined),
    destroy: jest.fn().mockResolvedValue(undefined),
    invalidateProviderCommandCaches: jest.fn(),
    // Read by the post-restore chat:tabs-changed emit (Round-31).
    getTabCount: jest.fn(() => 0),
    countTabsByKind: jest.fn(() => 0),
    // Read by the cross-leaf presence projection (Round-35: buildPresence → getAllViews → getAllTabs).
    getAllTabs: jest.fn(() => []),
    // Present so the onClose test can prove it is NOT the path taken.
    disposeAllRuntimes: jest.fn(),
  })),
}));

// The restore path's dedup/validation logic lives in teamChatDmTabs (unit-tested in
// teamChatDmTabs.test.ts); here we mock it to assert delegation + the gate/emit around it.
jest.mock('@/features/teamChat/teamChatDmTabs', () => ({
  restoreTeamChatDmTabs: jest.fn().mockResolvedValue(undefined),
  closeRotatedDmTab: jest.fn().mockResolvedValue(undefined),
  reconcileRotation: jest.fn().mockResolvedValue(undefined),
  // T7 helpers the view now wires: recency touch (projection) + LRU eviction (open path).
  touchDmRecency: jest.fn(),
  evictLruDmIfNeeded: jest.fn().mockResolvedValue(undefined),
}));

// Round-62/64/65 helpers: the view keeps thin call sites; the wiring logic + tests live in
// teamChatHostEvents.test.ts / teamChatHydrationBanner.test.ts. Here we mock them to
// assert the onOpen/onClose lifecycle + delegation without the real vault/event plumbing.
jest.mock('@/features/teamChat/teamChatHostEvents', () => ({
  // Round-64/65: the wiring returns a single disposer (offrefs refs + removes DOM listeners on a
  // re-entrant onOpen); the mock hands back a fresh jest.fn() per call so the lifecycle tests can
  // assert dispose-and-recreate.
  registerTeamChatDmHostEvents: jest.fn(() => jest.fn()),
}));
jest.mock('@/features/teamChat/teamChatHydrationBanner', () => ({
  createDmHydrationBanner: jest.fn(() => ({
    dispose: jest.fn(),
    consumePendingHydrationError: jest.fn(() => null),
  })),
}));

import { TabManager } from '@/features/chat/tabs/TabManager';
import { restoreTeamChatDmTabs } from '@/features/teamChat/teamChatDmTabs';
import { registerTeamChatDmHostEvents } from '@/features/teamChat/teamChatHostEvents';
import { createDmHydrationBanner } from '@/features/teamChat/teamChatHydrationBanner';
import { TeamChatView } from '@/features/teamChat/TeamChatView';

/** Drain pending microtasks so the fire-and-forget restore in initTabEngine
 *  (and the tabsRestored flip that follows it) settles before assertions. */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** A promise plus its resolver, to interleave a teardown while an open is pending. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

/** Prototype-only view wired just enough to drive the engine seam + persistence
 *  (mirrors SpecoratorView.test's harness). */
function makeView(): any {
  const view = Object.create(TeamChatView.prototype) as any;
  view.agentThreads = {};           // class-field initializer skipped by Object.create — the roster preview/timestamp source
  view.lastSeenByAgent = new Map(); // ditto — the per-leaf unread baseline
  view.railGeometry = { collapsed: false, width: 260 }; // ditto — the per-leaf rail chrome
  view.plugin = {
    logger: { scope: () => ({ error: jest.fn() }) },
    getConversationSync: jest.fn(() => null),
    events: { emit: jest.fn(), on: jest.fn(() => jest.fn()) },
    // Cross-leaf presence reads getAllViews (Round-35); this leaf wraps its own manager.
    getAllViews: () => [{ getTabManager: () => view.tabManager }],
  };
  view.leaf = { setViewState: jest.fn().mockResolvedValue(undefined) };
  view.contentEl = createMockEl();
  view.tabContentEl = createMockEl();
  view.registerEvent = jest.fn();     // ItemView method; Object.create skips it (used by the host-events wiring)
  view.containerEl = createMockEl();  // onOpen threads this into the host-events wiring (keydown target / click-away doc)
  view.subscriptions = null;          // class-field initializer skipped by Object.create — the consolidated leaf-subscription handle
  view.tabManager = null;
  view.tabsRestored = false;
  view.selectedAgentId = null;
  view.selectionGeneration = 0; // class-field initializer is skipped by Object.create
  view.selectionOpenTail = { tail: Promise.resolve() }; // ditto — the per-leaf open+reconcile tail (Round-49)
  view.dmRecency = [];          // ditto — the LRU recency array (T7)
  view.pendingTabManagerState = null;
  view.pendingPersist = null;
  view.vueApp = null;
  view.teamChatObservers = new Set();
  return view;
}

/** Captures the TabManager callbacks the view wired, so a test can fire
 *  onTabSwitched/onTabClosed/etc. exactly as the real engine would. */
function callbacksFor(): Record<string, (...args: unknown[]) => void> {
  return (TabManager as jest.Mock).mock.calls[0][3];
}

describe('TeamChatView — ChatViewHandle conformance', () => {
  beforeEach(() => jest.clearAllMocks());

  it('exposes the manager immediately but flips tabsRestored only after restore', async () => {
    const view = makeView();
    expect(view.getTabManager()).toBeNull();
    expect(view.areTabsRestored()).toBe(false);

    view.initTabEngine();

    expect(TabManager).toHaveBeenCalledTimes(1);
    // Enumerable immediately so getAllViews() (T4) can reach it...
    expect(view.getTabManager()).not.toBeNull();
    // ...but the Agent Board budget gate must not read a half-restored tab set,
    // so tabsRestored waits for the async restore (mirror of SpecoratorView).
    expect(view.areTabsRestored()).toBe(false);
    await flushMicrotasks();
    expect(view.areTabsRestored()).toBe(true);
  });

  it('does not rebuild the engine if the content host mounts twice', () => {
    const view = makeView();
    view.initTabEngine();
    view.initTabEngine();
    expect(TabManager).toHaveBeenCalledTimes(1);
  });

  // Round-37 Fix 1: Team Chat's empty state is the roster, so its manager must never
  // auto-mint a blank home tab when the last DM closes (which would surface an unbound
  // composer able to start an ordinary conversation under the empty-state overlay).
  it('disables the blank-tab fallback on its manager (:Fix1)', () => {
    const view = makeView();
    view.initTabEngine();
    expect(view.tabManager.autoCreateOnEmpty).toBe(false);
  });

  it('invalidateProviderCommandCaches delegates to the tab manager', () => {
    const view = makeView();
    view.initTabEngine();
    view.invalidateProviderCommandCaches('claude');
    expect(view.tabManager.invalidateProviderCommandCaches).toHaveBeenCalledWith('claude');
  });

  it('the UI-refresh surface re-projects the store (no throw) with no manager', () => {
    const view = makeView();
    // A shutdown broadcast can reach the view before/without an engine.
    expect(() => view.refreshModelSelector()).not.toThrow();
    expect(() => view.updateLayoutForPosition()).not.toThrow();
    expect(() => view.refreshTabControls()).not.toThrow();
    expect(() => view.applyEditedFilesSetting()).not.toThrow();
    expect(() => view.updateHiddenProviderCommands()).not.toThrow();
    return expect(view.refreshProviderAvailability()).resolves.toBeUndefined();
  });

  // Round-36 Fix 1a: a hidden-command settings change must repaint each OPEN DM's
  // persistent slash-command dropdown live (mirror of SpecoratorView), not just
  // re-project the store — otherwise an open DM keeps offering a now-hidden command.
  it('updateHiddenProviderCommands repaints each open DM dropdown with the provider hidden set', () => {
    const view = makeView();
    view.plugin.settings = { hiddenProviderCommands: { claude: ['commit', 'push'] } };
    view.plugin.getConversationSync = jest.fn(() => ({ providerId: 'claude', boundAgentId: 'roster:a' }));
    view.initTabEngine();
    const setHiddenCommands = jest.fn();
    view.tabManager.getAllTabs = jest.fn(() => [
      { conversationId: 'conv-1', state: { isStreaming: false }, ui: { slashCommandDropdown: { setHiddenCommands } } },
    ]);

    view.updateHiddenProviderCommands();

    // The provider (claude) hidden set is applied to the open DM's live dropdown.
    expect(setHiddenCommands).toHaveBeenCalledWith(new Set(['commit', 'push']));
  });
});

describe('TeamChatView — leaf-owned persistence', () => {
  beforeEach(() => jest.clearAllMocks());

  it('getState round-trips selectedAgentId set through setState', async () => {
    const view = makeView();
    // Set the manager directly (no initTabEngine → no restore projection) so this exercises
    // the raw setState→getState hint round-trip, not the restore-time selection reset (Fix 3).
    view.tabManager = { getAllTabs: jest.fn(() => []), getPersistedState: jest.fn(() => ({ openTabs: [], activeTabId: null })) };
    await view.setState({ selectedAgentId: 'roster:x' }, {});
    const state = view.getState();
    expect(state.selectedAgentId).toBe('roster:x');
    // Leaf-owned tab state travels in the same view-state blob (T5), never the
    // global persistTabManagerState() slot.
    expect(state.tabManagerState).toEqual({ openTabs: [], activeTabId: null });
  });

  it('selectAgent no longer seeds selectedAgentId — it projects off the active tab', async () => {
    const view = makeView();
    // No engine on this prototype view, so selectAgent returns without opening a
    // tab AND without touching selectedAgentId (the optimistic set was removed;
    // selection is now a pure projection of the active tab).
    await view.selectAgent('roster:y');
    expect(view.selectedAgentId).toBeNull();
    expect(view.getState().selectedAgentId).toBeUndefined();
  });
});

describe('TeamChatView — selectedAgentId projects from the active tab', () => {
  beforeEach(() => jest.clearAllMocks());

  it('onTabSwitched sets selectedAgentId from the active tab bound agent, and emits', () => {
    const view = makeView();
    // The DM's conversation carries both the bound agent (drives selection) and the
    // provider (projected onto the top-bar chip via projectActiveDmProviderId).
    view.plugin.getConversationSync = jest.fn(() => ({ boundAgentId: 'roster:a', providerId: 'claude' }));
    view.initTabEngine();
    // Real TabData carries .state (ChatState); the snapshot's edited-files
    // projection reads active.state.editedFiles, so the double must include it.
    view.tabManager.getActiveTab = jest.fn(() => ({ conversationId: 'conv-1', state: { editedFiles: [] } }));
    const observer = jest.fn();
    view.teamChatObservers = new Set([observer]);

    // The destination leaf's OWN onTabSwitched drives its selection (:218) — no
    // manual cross-leaf set from the source.
    callbacksFor().onTabSwitched();

    expect(view.plugin.getConversationSync).toHaveBeenCalledWith('conv-1');
    expect(view.selectedAgentId).toBe('roster:a');
    // Presence + the active DM's provider are projected alongside the selection; no
    // streaming tab → empty presence map.
    expect(observer).toHaveBeenCalledWith({
      selectedAgentId: 'roster:a',
      editedFiles: [],
      activeProviderId: 'claude',
      presence: {},
      // The roster-projection trio: no thread map on this fake, so all three are empty.
      activeModelLabel: null,
      threads: {},
      unread: {},
      activeDmIsEmpty: true,
    });
  });

  it('projects null (empty state) when closing to no active tab', () => {
    const view = makeView();
    view.initTabEngine();
    view.tabManager.getActiveTab = jest.fn(() => null);
    view.selectedAgentId = 'roster:stale';

    callbacksFor().onTabClosed();

    expect(view.selectedAgentId).toBeNull();
  });

  it('projects null when the active tab has no bound agent (blank tab)', () => {
    const view = makeView();
    view.plugin.getConversationSync = jest.fn(() => ({ boundAgentId: undefined }));
    view.initTabEngine();
    view.tabManager.getActiveTab = jest.fn(() => ({ conversationId: 'conv-blank', state: { editedFiles: [] } }));
    view.selectedAgentId = 'roster:stale';

    callbacksFor().onTabSwitched();

    expect(view.selectedAgentId).toBeNull();
  });
});

describe('TeamChatView — composer model picks', () => {
  beforeEach(() => jest.clearAllMocks());

  // Round-68: the top bar renders the DM's model, but a SAME-provider pick fires no
  // onTabProviderChanged and re-projects only the composer — so the chip kept the previous
  // model until some unrelated Team Chat event landed, showing two different active models.
  it('re-projects the snapshot on onTabModelChanged so the top-bar chip tracks the pick', () => {
    const view = makeView();
    view.initTabEngine();
    const observer = jest.fn();
    view.teamChatObservers = new Set([observer]);

    callbacksFor().onTabModelChanged('tab-1');

    expect(observer).toHaveBeenCalledTimes(1);
  });
});

describe('TeamChatView — roster presence projection (idle/busy)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('projects the streaming tab\'s bound agent as busy on onTabStreamingChanged(true)', () => {
    const view = makeView();
    // Presence contributes only for a real team-chat DM (Round-37 Fix 2).
    view.plugin.getConversationSync = jest.fn(() => ({ boundAgentId: 'roster:a', surface: 'team-chat' }));
    view.initTabEngine();
    // ChatState flips state.isStreaming before firing the callback, so the live
    // tab set already shows the streaming DM when the projection recomputes.
    view.tabManager.getAllTabs = jest.fn(() => [{ conversationId: 'conv-1', state: { isStreaming: true } }]);
    const observer = jest.fn();
    view.teamChatObservers = new Set([observer]);

    callbacksFor().onTabStreamingChanged('tab-1', true);

    expect(observer).toHaveBeenCalledWith(
      expect.objectContaining({ presence: { 'roster:a': 'busy' } }),
    );
  });

  it('drops the agent back to idle (absent) when streaming stops', () => {
    const view = makeView();
    view.plugin.getConversationSync = jest.fn(() => ({ boundAgentId: 'roster:a' }));
    view.initTabEngine();
    view.tabManager.getAllTabs = jest.fn(() => [{ conversationId: 'conv-1', state: { isStreaming: false } }]);
    const observer = jest.fn();
    view.teamChatObservers = new Set([observer]);

    callbacksFor().onTabStreamingChanged('tab-1', false);

    // Absent from the map → the roster dot reads idle.
    expect(observer).toHaveBeenCalledWith(expect.objectContaining({ presence: {} }));
  });

  it('projects the agent idle when its DM tab closes (tab gone from the set)', () => {
    const view = makeView();
    view.initTabEngine();
    // onTabClosed fires AFTER the engine deletes the tab, so getAllTabs no longer
    // lists it — the projection naturally recomputes the agent as idle.
    view.tabManager.getAllTabs = jest.fn(() => []);
    view.tabManager.getActiveTab = jest.fn(() => null);
    const observer = jest.fn();
    view.teamChatObservers = new Set([observer]);

    callbacksFor().onTabClosed('tab-1');

    expect(observer).toHaveBeenCalledWith(expect.objectContaining({ presence: {} }));
  });

  it('leaves an agent with no open DM tab idle (empty presence map)', () => {
    const view = makeView();
    view.initTabEngine();
    view.tabManager.getAllTabs = jest.fn(() => []);

    expect(view.buildSnapshot().presence).toEqual({});
  });
});

describe('TeamChatView — persisted DM tab restore', () => {
  beforeEach(() => jest.clearAllMocks());

  const twoDmLayout = {
    openTabs: [
      { tabId: 't1', conversationId: 'c1', kind: 'chat' as const },
      { tabId: 't2', conversationId: 'c2', kind: 'chat' as const },
    ],
    activeTabId: 't2',
  };

  it('getState → setState round-trips the whole tabManagerState (not just the selection)', async () => {
    const source = makeView();
    source.initTabEngine();
    source.tabManager.getPersistedState = jest.fn(() => twoDmLayout);
    const persisted = source.getState();

    const restored = makeView();
    await restored.setState(persisted, {});

    expect(restored.pendingTabManagerState).toEqual(twoDmLayout);
  });

  // Round-54 (data-loss, :507): when the leaf closes BEFORE restore completes (large transcripts still
  // prewarming in restoreTeamChatDmTabs' Promise.all), the live manager holds only a PARTIAL tab set,
  // but pendingTabManagerState still holds the FULL saved layout (restoreTabs nulls it only AFTER the
  // await at :255, and tabsRestored flips true synchronously right after — no interleave window). getState
  // must persist the FULL pending layout while restore is in flight, else the teardown persist overwrites
  // the saved leaf with a partial layout and the un-restored DMs don't reopen next time.
  it('getState mid-restore persists the FULL pending layout, not the partial live manager (Round-54)', () => {
    const view = makeView();
    view.pendingTabManagerState = twoDmLayout; // held; restore has not consumed it yet
    view.tabsRestored = false;                 // restore mid-flight
    // Only ONE of the two DMs prewarmed so far → the live manager reports a PARTIAL layout.
    const getPersistedState = jest.fn(() => ({ openTabs: [twoDmLayout.openTabs[0]], activeTabId: 't1' }));
    view.tabManager = { getAllTabs: jest.fn(() => []), getPersistedState };

    const state = view.getState();

    expect(state.tabManagerState).toEqual(twoDmLayout);
    expect(getPersistedState).not.toHaveBeenCalled(); // the partial live state is never read mid-restore
  });

  it('getState after restore completes returns the live manager layout (Round-54)', () => {
    const view = makeView();
    view.pendingTabManagerState = null; // consumed by restore (:255)
    view.tabsRestored = true;
    const liveLayout = { openTabs: [{ tabId: 't1', conversationId: 'c1', kind: 'chat' as const }], activeTabId: 't1' };
    view.tabManager = { getAllTabs: jest.fn(() => []), getPersistedState: jest.fn(() => liveLayout) };

    expect(view.getState().tabManagerState).toEqual(liveLayout);
  });

  it('initTabEngine restores every saved DM tab through the guarded team-chat restore', async () => {
    const view = makeView();
    view.pendingTabManagerState = twoDmLayout;

    view.initTabEngine();
    await flushMicrotasks();

    // Restore routes through the guarded team-chat path (dedup + validate), not raw restoreState.
    // The 4th arg is the Round-66 restore-time opening-marker setter (threaded from the view).
    expect(restoreTeamChatDmTabs).toHaveBeenCalledWith(view.plugin, view.tabManager, twoDmLayout, expect.any(Function));
    expect(view.pendingTabManagerState).toBeNull(); // consumed exactly once
    expect(view.areTabsRestored()).toBe(true);
  });

  it('skips the team-chat restore when there is no persisted layout', async () => {
    const view = makeView();
    view.pendingTabManagerState = null;

    view.initTabEngine();
    await flushMicrotasks();

    expect(restoreTeamChatDmTabs).not.toHaveBeenCalled();
    expect(view.areTabsRestored()).toBe(true);
  });

  // Round-31 (:171): getTabSlotUsage reports FULL while any view's areTabsRestored()
  // is false, so the Agent Board queue holds during this leaf's restore. When
  // tabsRestored flips true, capacity is readable again — but nothing re-emits, so
  // the queue can stay stalled. Mirror SpecoratorView: fire chat:tabs-changed once.
  it('emits chat:tabs-changed after restore so the Agent Board queue re-ticks (:171)', async () => {
    const view = makeView();
    view.pendingTabManagerState = null; // no-persisted-layout path (tabsRestored still flips true)

    view.initTabEngine();
    await flushMicrotasks();

    expect(view.areTabsRestored()).toBe(true);
    expect(view.plugin.events.emit).toHaveBeenCalledWith('chat:tabs-changed', {
      openCount: expect.any(Number),
      chatCount: expect.any(Number),
      workOrderCount: expect.any(Number),
    });
  });

  // Round-33 (:185): if onOpen re-enters and swaps in a replacement manager while
  // the OLD manager is still pre-hydrating, the OLD restore reaching its finally
  // must NOT publish readiness (Round-32 reset the gate to false) — otherwise a
  // roster click passes selectAgent's gate and duplicates a tab concurrent with the
  // NEW restore. Only the current manager's restore may publish.
  it('a superseded manager restore does not publish readiness (:185)', async () => {
    const restoreGate = deferred<void>();
    (restoreTeamChatDmTabs as jest.Mock).mockReturnValueOnce(restoreGate.promise); // suspend the restore
    const view = makeView();
    const m1 = { getTabCount: jest.fn(() => 0), countTabsByKind: jest.fn(() => 0) };
    view.tabManager = m1;
    view.tabsRestored = false;
    view.pendingTabManagerState = { openTabs: [{ tabId: 't1', conversationId: 'c1', kind: 'chat' }], activeTabId: 't1' };

    const restoring = view.restoreTabsThenMarkReady(); // captures m1, awaits the (suspended) restore
    await flushMicrotasks();
    expect(view.areTabsRestored()).toBe(false);

    // A re-entrant onOpen swapped in a replacement manager while m1's restore hung.
    view.tabManager = { getAllTabs: jest.fn(() => []), };

    restoreGate.resolve();      // m1's now-stale restore completes and hits its finally
    await restoring;

    // The stale restore stayed silent — it did not re-open the gate or re-emit.
    expect(view.areTabsRestored()).toBe(false);
    expect(view.plugin.events.emit).not.toHaveBeenCalled();
  });

  it('the current manager restore publishes readiness (:185)', async () => {
    const view = makeView();
    const m1 = {
      restoreState: jest.fn().mockResolvedValue(undefined),
      getTabCount: jest.fn(() => 0),
      countTabsByKind: jest.fn(() => 0),
      // Fix 3: the finally projects selection off the active tab (which reads getAllTabs for presence).
      getActiveTab: jest.fn(() => null),
      getAllTabs: jest.fn(() => []),
    };
    view.tabManager = m1;
    view.tabsRestored = false;
    view.pendingTabManagerState = null; // no-persisted-layout path; tabManager stays m1 through the finally

    await view.restoreTabsThenMarkReady();

    expect(view.areTabsRestored()).toBe(true);
    expect(view.plugin.events.emit).toHaveBeenCalledWith('chat:tabs-changed', expect.anything());
  });

  // Round-33 (:109): the re-entrant onOpen branch tears down the old manager but must
  // also cancel the armed pending-persist debounce — its callback calls setViewState
  // (the very re-entry onOpen avoids) and can race the newly mounting manager.
  it('re-entrant onOpen cancels the armed pending-persist debounce (:109)', async () => {
    jest.useFakeTimers();
    try {
      const setViewState = jest.fn().mockResolvedValue(undefined);
      const view = makeView();
      view.leaf = { setViewState };
      view.tabManager = {
        getAllTabs: jest.fn(() => []),
        getPersistedState: jest.fn(() => ({ openTabs: [], activeTabId: null })),
        destroy: jest.fn().mockResolvedValue(undefined),
      };

      view.persistTabState();                 // arms the 300ms debounce (as a tab callback would)
      expect(view.pendingPersist).not.toBeNull();

      await view.onOpen();                     // re-entrant branch must cancel it before rebuilding

      expect(view.pendingPersist).toBeNull();
      jest.advanceTimersByTime(1000);
      expect(setViewState).not.toHaveBeenCalled(); // the canceled timer never fired
    } finally {
      jest.useRealTimers();
    }
  });

  // Round-30 (:90): the re-entrant onOpen teardown must bump selectionGeneration
  // (like destroyTabRuntime does), or an in-flight open whose resolveOrCreate settles
  // during the teardown window still passes isSelectionStale (manager not yet nulled)
  // and createTabs into the manager being destroyed → a leaked runtime.
  it('re-entrant onOpen bumps the generation so an in-flight open cannot createTab into the tearing-down manager (:90)', async () => {
    const resolveConv = deferred<string>();
    const destroyGate = deferred<void>();
    const createTab = jest.fn().mockResolvedValue({ id: 'tab-new' });
    const view = makeView();
    view.tabsRestored = true;
    view.plugin.getTeamChatThreadStore = () => ({
      get: jest.fn().mockResolvedValue(null),
      resolveOrCreate: jest.fn(() => resolveConv.promise),
    });
    view.plugin.findConversationAcrossViews = jest.fn(() => null);
    view.tabManager = {
      getAllTabs: jest.fn(() => []),
      createTab,
      switchToTab: jest.fn(),
      getPersistedState: jest.fn(() => ({ openTabs: [], activeTabId: null })),
      destroy: jest.fn(() => destroyGate.promise),
    };

    const open = view.selectAgent('roster:a'); // parks on resolveOrCreate
    const reopen = view.onOpen();               // re-entrant: bumps generation, parks on destroy()
    await flushMicrotasks();                     // onOpen reaches destroy() (tabManager still set)
    resolveConv.resolve('conv-1');               // open resumes DURING the teardown window
    await open;
    destroyGate.resolve();
    await reopen;

    // The generation bump invalidated the in-flight open — no tab mounted into the
    // manager being destroyed.
    expect(createTab).not.toHaveBeenCalled();
  });

  // Round-32 (:90): the OLD engine leaves tabsRestored true; the NEW manager's
  // restoreState runs async. Re-entrant onOpen must re-close the gate (tabsRestored
  // false) before rebuilding, or a roster click in the window passes selectAgent's
  // !tabsRestored gate and createTabs concurrently with the new restore → duplicate.
  // initTabEngine flips it back true after the new restore (Round-31).
  it('re-entrant onOpen re-closes then the rebuilt engine reopens the restore gate (:90)', async () => {
    const view = makeView();
    view.tabsRestored = true; // old engine had finished restoring
    view.tabManager = {
      getAllTabs: jest.fn(() => []),
      getPersistedState: jest.fn(() => ({ openTabs: [], activeTabId: null })),
      destroy: jest.fn().mockResolvedValue(undefined),
    };

    await view.onOpen();

    // Gate re-closed during the rebuild window (new restoreState hasn't run yet).
    expect(view.areTabsRestored()).toBe(false);

    // Simulate the Vue host callback the stubbed mount skipped: build the new engine.
    view.tabContentEl = createMockEl();
    view.initTabEngine();
    await flushMicrotasks();

    // Reopened once the new restore completed.
    expect(view.areTabsRestored()).toBe(true);
  });

  // Round-48 Fix C (:400): the re-entrant onOpen teardown re-closes the restore gate; it must also
  // drop any selection queued against the PRIOR mount, or that stale click would drain after the new
  // restore and open a DM the user never asked for in this mount.
  it('re-entrant onOpen clears a stale queued selection (:400)', async () => {
    const view = makeView();
    view.tabsRestored = true;
    view.pendingAgentSelection = 'roster:stale';
    view.tabManager = {
      getAllTabs: jest.fn(() => []),
      getPersistedState: jest.fn(() => ({ openTabs: [], activeTabId: null })),
      destroy: jest.fn().mockResolvedValue(undefined),
    };

    await view.onOpen();

    expect(view.pendingAgentSelection).toBeNull();
  });

  // Round-29 (:90): a re-entrant onOpen (leaf move/pop-out, no interleaved onClose)
  // must capture the LIVE layout before destroying the prior engine — the initial
  // setState layout was already consumed by the first initTabEngine, so otherwise
  // the rebuilt engine restores nothing and the pane goes blank.
  it('re-entrant onOpen captures the live layout before destroy so the rebuild restores it (:90)', async () => {
    const order: string[] = [];
    const layout = {
      openTabs: [{ tabId: 't1', conversationId: 'c1', kind: 'chat' as const }],
      activeTabId: 't1',
    };
    const view = makeView();
    view.pendingTabManagerState = null; // initial setState layout already consumed by the first init
    view.tabManager = {
      getAllTabs: jest.fn(() => []),
      getPersistedState: jest.fn(() => { order.push('capture'); return layout; }),
      destroy: jest.fn(() => { order.push('destroy'); return Promise.resolve(); }),
    };

    await view.onOpen();

    // The live layout is stashed for the rebuilt engine's restore (Round-24 restore
    // test above proves initTabEngine then reopens it) — captured BEFORE destroy.
    expect(view.pendingTabManagerState).toEqual(layout);
    expect(order).toEqual(['capture', 'destroy']);
  });

  // Round-37 Fix 3 (:30): when every persisted DM is missing/invalid, restore activates
  // no tab, so the view would keep the persisted selectedAgentId restore hint and a later
  // reprojection would highlight an agent with no transcript. Restore must project a null
  // selection so the empty state shows.
  it('clears the stale selectedAgentId hint when restore activates no DM tab (:30)', async () => {
    const view = makeView();
    view.selectedAgentId = 'roster:persisted'; // hint set by setState, no tab behind it
    view.pendingTabManagerState = null;         // nothing restorable
    view.tabManager = {
      getActiveTab: jest.fn(() => null),
      getAllTabs: jest.fn(() => []),
      getTabCount: jest.fn(() => 0),
      countTabsByKind: jest.fn(() => 0),
    };
    view.tabsRestored = false;

    await view.restoreTabsThenMarkReady();

    // Projected off the (absent) active tab → null, so the roster shows no highlight
    // and the right pane shows its empty state.
    expect(view.selectedAgentId).toBeNull();
  });

  // Round-37 Fix 3: the normal restore-with-active-tab path still projects the active
  // DM's agent (the finally projection reads whatever tab restore activated).
  it('projects the active DM agent after a restore that leaves a tab active (:30)', async () => {
    const view = makeView();
    view.selectedAgentId = null;
    view.plugin.getConversationSync = jest.fn(() => ({ boundAgentId: 'roster:active' }));
    view.pendingTabManagerState = null;
    view.tabManager = {
      getActiveTab: jest.fn(() => ({ conversationId: 'c-active', state: { editedFiles: [] } })),
      getAllTabs: jest.fn(() => []),
      getTabCount: jest.fn(() => 1),
      countTabsByKind: jest.fn(() => 1),
    };
    view.tabsRestored = false;

    await view.restoreTabsThenMarkReady();

    expect(view.selectedAgentId).toBe('roster:active');
  });

  // Round-48 Fix C (:400): a roster click made while tabs were still restoring is queued in
  // pendingAgentSelection and drained once restore completes — as a normal focus-taking selection.
  it('drains a queued restore-time selection once tabs finish restoring (:400)', async () => {
    const view = makeView();
    view.pendingTabManagerState = null;
    view.pendingAgentSelection = 'roster:queued';
    view.tabManager = {
      getActiveTab: jest.fn(() => null),
      getAllTabs: jest.fn(() => []),
      getTabCount: jest.fn(() => 0),
      countTabsByKind: jest.fn(() => 0),
    };
    view.tabsRestored = false;
    const selectAgent = jest.spyOn(view, 'selectAgent').mockResolvedValue(undefined);

    await view.restoreTabsThenMarkReady();

    // Opened exactly once, as a plain (focus-taking) selection, and the queue is cleared.
    expect(selectAgent).toHaveBeenCalledTimes(1);
    expect(selectAgent).toHaveBeenCalledWith('roster:queued');
    expect(view.pendingAgentSelection).toBeNull();
  });

  it('opens nothing after restore when no selection was queued (:400)', async () => {
    const view = makeView();
    view.pendingTabManagerState = null;
    view.pendingAgentSelection = null;
    view.tabManager = {
      getActiveTab: jest.fn(() => null),
      getAllTabs: jest.fn(() => []),
      getTabCount: jest.fn(() => 0),
      countTabsByKind: jest.fn(() => 0),
    };
    view.tabsRestored = false;
    const selectAgent = jest.spyOn(view, 'selectAgent').mockResolvedValue(undefined);

    await view.restoreTabsThenMarkReady();

    expect(selectAgent).not.toHaveBeenCalled();
  });

  // Round-63: the drained click is fire-and-forget (`void`), so a REJECTING drained selection
  // (threads.json persist / conversation create failure) must route through the SAME catch+log path
  // as the normal roster click (openAgentDm) — else it is an unhandled rejection + a silently lost
  // click. restoreTabsThenMarkReady must still resolve, and the rejection must be caught + logged.
  it('catches + logs a rejecting drained restore-time selection (Round-63)', async () => {
    const view = makeView();
    const error = jest.fn();
    view.plugin.logger = { scope: () => ({ error }) };
    view.pendingTabManagerState = null;
    view.pendingAgentSelection = 'roster:queued';
    view.tabManager = {
      getActiveTab: jest.fn(() => null),
      getAllTabs: jest.fn(() => []),
      getTabCount: jest.fn(() => 0),
      countTabsByKind: jest.fn(() => 0),
    };
    view.tabsRestored = false;
    const failure = new Error('threads.json persist failed');
    jest.spyOn(view, 'selectAgent').mockRejectedValue(failure);

    // The restore drain itself resolves (never rejects) ...
    await expect(view.restoreTabsThenMarkReady()).resolves.toBeUndefined();
    await flushMicrotasks(); // let the drained open's .catch settle

    // ... and the drained click's rejection was caught + logged, not left unhandled.
    expect(error).toHaveBeenCalledWith('selectAgent failed', failure);
  });

  // Round-50 (second-order of Fix C): the drain reads pendingAgentSelection AFTER the (possibly slow)
  // reconcileRestoredDmProviders await. A newer roster click (C) landing DURING that await proceeds
  // (tabsRestored is already true) and, per the fix, clears the queued restore-time pick (B) — so the
  // drain sees null and does NOT replay the stale B over C (last-click-wins).
  it('a newer selection during the post-restore reconcile is not clobbered by the drain (Round-50)', async () => {
    const reconcileGate = deferred<void>();
    const view = makeView();
    view.pendingTabManagerState = null;
    view.pendingAgentSelection = 'roster:B'; // B was clicked while tabs were still restoring
    view.tabManager = {
      getActiveTab: jest.fn(() => null),
      getAllTabs: jest.fn(() => []),
      getTabCount: jest.fn(() => 0),
      countTabsByKind: jest.fn(() => 0),
    };
    view.tabsRestored = false;
    // A parking thread store so the injected C selection reaches the proceed-path clear then awaits
    // get() forever — it never needs to fully open, which keeps this test off the engine machinery.
    view.plugin.getTeamChatThreadStore = () => ({ get: () => new Promise(() => {}), resolveOrCreate: jest.fn() });
    // Gate the post-restore reconcile so a newer roster click can interleave before the drain runs.
    jest.spyOn(view, 'refreshProviderAvailability').mockReturnValue(reconcileGate.promise);
    const selectAgent = jest.spyOn(view, 'selectAgent'); // call-through: records calls AND runs the real clear

    const restoring = view.restoreTabsThenMarkReady();
    await flushMicrotasks(); // reach the gated reconcile; tabsRestored is now true

    void view.selectAgent('roster:C'); // newer click DURING the reconcile await → clears the queued B
    await flushMicrotasks();
    reconcileGate.resolve();
    await restoring;

    // C was honored; the drain saw the cleared pick and did NOT replay the stale B.
    expect(selectAgent).toHaveBeenCalledWith('roster:C');
    expect(selectAgent).not.toHaveBeenCalledWith('roster:B');
    expect(view.pendingAgentSelection).toBeNull();
  });

  // Round-51 (:334): the mirror of the Round-50 case, but a BACKGROUND rotation (preserveFocus) lands during
  // the reconcile await instead of a foreground click. A rotation runs DURING reconcileRestoredDmProviders,
  // which is BEFORE the drain, so it must NOT clear the queued restore-time pick (only a foreground selection
  // supersedes it) — otherwise the drain sees null and the queued pick is lost. The pick still drains.
  it('a background rotation during the post-restore reconcile does not clobber the queued pick — it still drains (Round-51)', async () => {
    const reconcileGate = deferred<void>();
    const view = makeView();
    view.pendingTabManagerState = null;
    view.pendingAgentSelection = 'roster:B'; // queued while tabs were still restoring
    view.tabManager = {
      getActiveTab: jest.fn(() => null),
      getAllTabs: jest.fn(() => []),
      getTabCount: jest.fn(() => 0),
      countTabsByKind: jest.fn(() => 0),
    };
    view.tabsRestored = false;
    // Parking thread store: the injected rotation reaches the (skipped) clear then awaits get() forever,
    // keeping this test off the engine machinery (as in the Round-50 sibling above).
    view.plugin.getTeamChatThreadStore = () => ({ get: () => new Promise(() => {}), resolveOrCreate: jest.fn() });
    jest.spyOn(view, 'refreshProviderAvailability').mockReturnValue(reconcileGate.promise);
    const selectAgent = jest.spyOn(view, 'selectAgent'); // call-through: records calls AND runs the real clear-gate

    const restoring = view.restoreTabsThenMarkReady();
    await flushMicrotasks(); // reach the gated reconcile; tabsRestored is now true

    void view.selectAgent('roster:rotated', { preserveFocus: true }); // background rotation DURING the reconcile await
    await flushMicrotasks();
    reconcileGate.resolve();
    await restoring;

    // The rotation left the queued pick intact (last-click-wins is FOREGROUND-only), so the drain replayed it.
    expect(selectAgent).toHaveBeenCalledWith('roster:rotated', { preserveFocus: true });
    expect(selectAgent).toHaveBeenCalledWith('roster:B');
    expect(view.pendingAgentSelection).toBeNull();
  });
});

describe('TeamChatView — onClose teardown', () => {
  beforeEach(() => jest.clearAllMocks());

  it('force-persists leaf state and awaits tabManager.destroy (NOT disposeAllRuntimes)', async () => {
    const view = makeView();
    view.initTabEngine();
    const manager = view.tabManager;

    await view.onClose();

    // Force-persist the leaf state (Team Chat is leaf-owned).
    expect(view.leaf.setViewState).toHaveBeenCalled();
    // Full teardown saves every open DM + disposes tabs/controllers/islands.
    expect(manager.destroy).toHaveBeenCalledTimes(1);
    // The runtime-only shutdown path would leak controllers/listeners/islands.
    expect(manager.disposeAllRuntimes).not.toHaveBeenCalled();
    expect(view.getTabManager()).toBeNull();
  });

  // Round-54 (data-loss, :507): onClose during an in-flight restore persists via getState → the teardown
  // must write the FULL saved layout still held in pendingTabManagerState, not the partial live manager
  // state, so the un-restored DMs reopen on the next load instead of being overwritten with a partial set.
  it('teardown persist during an in-flight restore writes the FULL pending layout (Round-54)', async () => {
    const view = makeView();
    const fullLayout = {
      openTabs: [
        { tabId: 't1', conversationId: 'c1', kind: 'chat' as const },
        { tabId: 't2', conversationId: 'c2', kind: 'chat' as const },
      ],
      activeTabId: 't2',
    };
    view.pendingTabManagerState = fullLayout;
    view.tabsRestored = false; // restore still prewarming when the leaf closes
    view.pendingPersist = null;
    const setViewState = jest.fn().mockResolvedValue(undefined);
    view.leaf = { setViewState };
    view.tabManager = {
      getAllTabs: jest.fn(() => []),
      getPersistedState: jest.fn(() => ({ openTabs: [fullLayout.openTabs[0]], activeTabId: 't1' })), // partial
      destroy: jest.fn().mockResolvedValue(undefined),
    };

    await view.destroyTabRuntime();

    const persisted = setViewState.mock.calls[0][0].state;
    expect(persisted.tabManagerState).toEqual(fullLayout); // full layout preserved, not the partial live one
    expect(view.getTabManager()).toBeNull();               // destroyed after the persist
  });

  // Round-28 (:197): teardown must invalidate in-flight selectAgent opens FIRST —
  // before persist/destroy — otherwise an open still mid-resolve passes the stale
  // check (manager not yet nulled) and createTabs into a manager whose tabs
  // destroy() already snapshotted, leaking that runtime.
  it('bumps selectionGeneration before awaiting persist/destroy', async () => {
    const view = makeView();
    let genAtPersist = -1;
    let genAtDestroy = -1;
    view.selectionGeneration = 7;
    view.pendingPersist = null;
    view.tabManager = {
      getAllTabs: jest.fn(() => []),
      getPersistedState: jest.fn(() => {
        genAtPersist = view.selectionGeneration; // read while getState persists the layout
        return { openTabs: [], activeTabId: null };
      }),
      destroy: jest.fn(() => {
        genAtDestroy = view.selectionGeneration;
        return Promise.resolve();
      }),
    };

    await view.destroyTabRuntime();

    // The bump happens FIRST, so both persist and destroy observe the incremented
    // generation — any in-flight open is already invalidated.
    expect(genAtPersist).toBe(8);
    expect(genAtDestroy).toBe(8);
    expect(view.getTabManager()).toBeNull();
  });

  // Round-37 Fix 4 (:261): destroyTab skips the streaming/closed callbacks, and onClose
  // unsubscribes before teardown, so a leaf whose streaming DM lit another leaf's busy dot
  // would leave that dot stuck. onClose must broadcast teamChat:presence AFTER teardown so
  // surviving leaves recompute (they no longer see this leaf's now-gone streaming DM).
  it('broadcasts teamChat:presence after teardown so surviving leaves recompute (:261)', async () => {
    const view = makeView();
    const order: string[] = [];
    view.tabManager = {
      getAllTabs: jest.fn(() => []),
      getPersistedState: jest.fn(() => ({ openTabs: [], activeTabId: null })),
      destroy: jest.fn(() => { order.push('destroy'); return Promise.resolve(); }),
    };
    view.plugin.events.emit = jest.fn((event: string) => { order.push(`emit:${event}`); });

    await view.onClose();

    // Emitted, and AFTER destroy — so the projection reflects the removed tabs.
    expect(view.plugin.events.emit).toHaveBeenCalledWith('teamChat:presence');
    expect(order).toEqual(['destroy', 'emit:teamChat:presence']);
  });

  // Round-39 Concern A: onOpen wires the roster:changed reconcile subscription (mirror of
  // presence), onClose tears it down — so a closed leaf stops reacting to roster edits.
  it('subscribes to roster:changed on open and unsubscribes on close', async () => {
    const view = makeView();
    const rosterOff = jest.fn();
    view.plugin.events.on = jest.fn((event: string) => (event === 'roster:changed' ? rosterOff : jest.fn()));

    await view.onOpen();
    expect(view.plugin.events.on).toHaveBeenCalledWith('roster:changed', expect.any(Function));

    await view.onClose();
    expect(rosterOff).toHaveBeenCalledTimes(1);
  });
});

// Round-62/65: the SpecoratorView-parity wirings the Team Chat host was missing — the DM
// host events (file-context cache vault events + mention click-away + Shift+Tab plan toggle,
// folded into one disposer) and the DM hydration-failure banner. The wiring logic + ownership
// gate live in the helper modules (mocked here); these assert the view's thin call sites + the
// presence-mirroring subscribe lifecycle.
describe('TeamChatView — DM host events + hydration banner (Round-62/65)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('registers the DM host events on open, reading the live active tab + containerEl + this.registerEvent', async () => {
    const view = makeView();

    await view.onOpen();

    expect(registerTeamChatDmHostEvents).toHaveBeenCalledWith(
      view.plugin,
      expect.any(Function),
      view.containerEl,
      expect.any(Function),
    );
    const [, getActiveTab, , registerEvent] = (registerTeamChatDmHostEvents as jest.Mock).mock.calls[0];
    // The accessor reads the LIVE manager off `this` (survives a manager rebuild).
    view.tabManager = { getAllTabs: jest.fn(() => []), getActiveTab: jest.fn(() => 'ACTIVE-DM') };
    expect(getActiveTab()).toBe('ACTIVE-DM');
    // A null manager is a safe null (empty-roster state has no active tab).
    view.tabManager = null;
    expect(getActiveTab()).toBeNull();
    // The register callback routes refs to ItemView.registerEvent (auto-dispose on unload).
    const ref = { event: 'create' };
    registerEvent(ref);
    expect(view.registerEvent).toHaveBeenCalledWith(ref);
  });

  it('subscribes the DM hydration banner on open (host = this view) and disposes it on close', async () => {
    const view = makeView();

    await view.onOpen();

    expect(createDmHydrationBanner).toHaveBeenCalledWith(view.plugin, view);
    const controller = (createDmHydrationBanner as jest.Mock).mock.results[0].value;
    // Reached through the consolidated subscriptions handle (one dispose+recreate for every
    // leaf subscription), not a dedicated field.
    expect(view.subscriptions.hydrationBanner).toBe(controller);

    await view.onClose();

    expect(controller.dispose).toHaveBeenCalledTimes(1);
    expect(view.subscriptions).toBeNull(); // the whole handle is dropped, banner included
  });

  it('re-entrant onOpen disposes the prior banner before re-subscribing (no leak)', async () => {
    const view = makeView();
    await view.onOpen();
    const first = (createDmHydrationBanner as jest.Mock).mock.results[0].value;

    // A re-entrant onOpen (popout/move, no interleaved onClose): tabManager is set, so the
    // teardown branch runs. The banner must be disposed and re-created, never doubled.
    view.tabManager = {
      getAllTabs: jest.fn(() => []),
      getPersistedState: jest.fn(() => ({ openTabs: [], activeTabId: null })),
      destroy: jest.fn().mockResolvedValue(undefined),
    };
    await view.onOpen();

    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(createDmHydrationBanner).toHaveBeenCalledTimes(2);
    expect(view.subscriptions.hydrationBanner).toBe((createDmHydrationBanner as jest.Mock).mock.results[1].value);
  });

  // Round-64/65: the host-events registration must dispose-and-recreate like the presence/roster/banner
  // subscriptions — a re-entrant onOpen (popout / leaf-move, no interleaved onClose) would otherwise
  // leave the prior vault/workspace + DOM listeners live until unload, growing the listener count on
  // every rebuild. The single disposer (offrefs refs + removes DOM listeners) is called before re-registering.
  it('re-entrant onOpen disposes the prior DM host-event registration before re-registering (no leak, Round-64/65)', async () => {
    const view = makeView();
    await view.onOpen();
    const firstDispose = (registerTeamChatDmHostEvents as jest.Mock).mock.results[0].value;

    // A re-entrant onOpen (tabManager set → the teardown branch runs), no interleaved onClose.
    view.tabManager = {
      getAllTabs: jest.fn(() => []),
      getPersistedState: jest.fn(() => ({ openTabs: [], activeTabId: null })),
      destroy: jest.fn().mockResolvedValue(undefined),
    };
    await view.onOpen();

    // The prior batch was disposed, and exactly one fresh registration replaced it (net +0 listeners).
    expect(firstDispose).toHaveBeenCalledTimes(1);
    expect(registerTeamChatDmHostEvents).toHaveBeenCalledTimes(2);
  });

  it('onClose disposes the DM host-event registration (Round-64/65)', async () => {
    const view = makeView();
    await view.onOpen();
    const dispose = (registerTeamChatDmHostEvents as jest.Mock).mock.results[0].value;

    await view.onClose();

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(view.subscriptions).toBeNull(); // the host-event disposer rides the same handle
  });

  it('consumePendingHydrationError delegates to the banner controller (the restoreConversation seam)', async () => {
    const view = makeView();
    await view.onOpen();
    const controller = (createDmHydrationBanner as jest.Mock).mock.results[0].value;
    (controller.consumePendingHydrationError as jest.Mock).mockReturnValue({ code: 'x', message: 'boom' });

    expect(view.consumePendingHydrationError('c1')).toEqual({ code: 'x', message: 'boom' });
    expect(controller.consumePendingHydrationError).toHaveBeenCalledWith('c1');
  });

  it('consumePendingHydrationError is a safe null when no banner is subscribed', () => {
    const view = makeView();
    view.hydrationBanner = null;

    expect(view.consumePendingHydrationError('c1')).toBeNull();
  });
});
