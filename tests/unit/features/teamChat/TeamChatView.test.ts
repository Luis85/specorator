import { createMockEl } from '@test/helpers/mockElement';

// Mock the engine so the view's ChatViewHandle conformance can be exercised
// without constructing the real tab stack (controllers, runtimes, islands).
jest.mock('@/features/chat/tabs/TabManager', () => ({
  TabManager: jest.fn().mockImplementation(() => ({
    getPersistedState: jest.fn(() => ({ openTabs: [], activeTabId: null })),
    getActiveTab: jest.fn(() => null),
    restoreState: jest.fn().mockResolvedValue(undefined),
    destroy: jest.fn().mockResolvedValue(undefined),
    invalidateProviderCommandCaches: jest.fn(),
    // Present so the onClose test can prove it is NOT the path taken.
    disposeAllRuntimes: jest.fn(),
  })),
}));

import { TabManager } from '@/features/chat/tabs/TabManager';
import { TeamChatView } from '@/features/teamChat/TeamChatView';

/** Drain pending microtasks so the fire-and-forget restore in initTabEngine
 *  (and the tabsRestored flip that follows it) settles before assertions. */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Prototype-only view wired just enough to drive the engine seam + persistence
 *  (mirrors SpecoratorView.test's harness). */
function makeView(): any {
  const view = Object.create(TeamChatView.prototype) as any;
  view.plugin = {
    logger: { scope: () => ({ error: jest.fn() }) },
    getConversationSync: jest.fn(() => null),
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
function callbacksFor(): Record<string, () => void> {
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
    view.tabManager.getActiveTab = jest.fn(() => ({ conversationId: 'conv-1' }));
    const observer = jest.fn();
    view.teamChatObservers = new Set([observer]);

    // The destination leaf's OWN onTabSwitched drives its selection (:218) — no
    // manual cross-leaf set from the source.
    callbacksFor().onTabSwitched();

    expect(view.plugin.getConversationSync).toHaveBeenCalledWith('conv-1');
    expect(view.selectedAgentId).toBe('roster:a');
    expect(observer).toHaveBeenCalledWith({ selectedAgentId: 'roster:a' });
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
    view.tabManager.getActiveTab = jest.fn(() => ({ conversationId: 'conv-blank' }));
    view.selectedAgentId = 'roster:stale';

    callbacksFor().onTabSwitched();

    expect(view.selectedAgentId).toBeNull();
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

  it('initTabEngine restores every saved DM tab through the engine restore path', async () => {
    const view = makeView();
    view.pendingTabManagerState = twoDmLayout;

    view.initTabEngine();
    await flushMicrotasks();

    // All saved DM tabs round-trip (restoreState re-creates them + switches to the
    // active one, whose onTabSwitched then drives the selection projection).
    expect(view.tabManager.restoreState).toHaveBeenCalledWith(twoDmLayout);
    expect(view.pendingTabManagerState).toBeNull(); // consumed exactly once
    expect(view.areTabsRestored()).toBe(true);
  });

  it('skips restoreState when there is no persisted layout', async () => {
    const view = makeView();
    view.pendingTabManagerState = null;

    view.initTabEngine();
    await flushMicrotasks();

    expect(view.tabManager.restoreState).not.toHaveBeenCalled();
    expect(view.areTabsRestored()).toBe(true);
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
});
