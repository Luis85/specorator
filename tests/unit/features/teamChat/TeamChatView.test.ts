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
    // Read by the snapshot's presence projection (buildPresence → getAllTabs).
    getAllTabs: jest.fn(() => []),
    restoreState: jest.fn().mockResolvedValue(undefined),
    destroy: jest.fn().mockResolvedValue(undefined),
    invalidateProviderCommandCaches: jest.fn(),
    // Read by the post-restore chat:tabs-changed emit (Round-31).
    getTabCount: jest.fn(() => 0),
    countTabsByKind: jest.fn(() => 0),
    // Present so the onClose test can prove it is NOT the path taken.
    disposeAllRuntimes: jest.fn(),
  })),
}));

// The restore path's dedup/validation logic lives in teamChatDmTabs (unit-tested in
// teamChatDmTabs.test.ts); here we mock it to assert delegation + the gate/emit around it.
jest.mock('@/features/teamChat/teamChatDmTabs', () => ({
  restoreTeamChatDmTabs: jest.fn().mockResolvedValue(undefined),
  closeRotatedDmTab: jest.fn().mockResolvedValue(undefined),
}));

import { TabManager } from '@/features/chat/tabs/TabManager';
import { restoreTeamChatDmTabs } from '@/features/teamChat/teamChatDmTabs';
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
  view.plugin = {
    logger: { scope: () => ({ error: jest.fn() }) },
    getConversationSync: jest.fn(() => null),
    events: { emit: jest.fn() },
  };
  view.leaf = { setViewState: jest.fn().mockResolvedValue(undefined) };
  view.contentEl = createMockEl();
  view.tabContentEl = createMockEl();
  view.tabManager = null;
  view.tabsRestored = false;
  view.selectedAgentId = null;
  view.selectionGeneration = 0; // class-field initializer is skipped by Object.create
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
});

describe('TeamChatView — leaf-owned persistence', () => {
  beforeEach(() => jest.clearAllMocks());

  it('getState round-trips selectedAgentId set through setState', async () => {
    const view = makeView();
    view.initTabEngine();
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
    view.plugin.getConversationSync = jest.fn(() => ({ boundAgentId: 'roster:a' }));
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
    // Presence is projected alongside the selection; no streaming tab → empty map.
    expect(observer).toHaveBeenCalledWith({ selectedAgentId: 'roster:a', editedFiles: [], presence: {} });
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

describe('TeamChatView — roster presence projection (idle/busy)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('projects the streaming tab\'s bound agent as busy on onTabStreamingChanged(true)', () => {
    const view = makeView();
    view.plugin.getConversationSync = jest.fn(() => ({ boundAgentId: 'roster:a' }));
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

  it('initTabEngine restores every saved DM tab through the guarded team-chat restore', async () => {
    const view = makeView();
    view.pendingTabManagerState = twoDmLayout;

    view.initTabEngine();
    await flushMicrotasks();

    // Restore routes through the guarded team-chat path (dedup + validate), not raw restoreState.
    expect(restoreTeamChatDmTabs).toHaveBeenCalledWith(view.plugin, view.tabManager, twoDmLayout);
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
    view.tabManager = {};

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
      getPersistedState: jest.fn(() => { order.push('capture'); return layout; }),
      destroy: jest.fn(() => { order.push('destroy'); return Promise.resolve(); }),
    };

    await view.onOpen();

    // The live layout is stashed for the rebuilt engine's restore (Round-24 restore
    // test above proves initTabEngine then reopens it) — captured BEFORE destroy.
    expect(view.pendingTabManagerState).toEqual(layout);
    expect(order).toEqual(['capture', 'destroy']);
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
});
