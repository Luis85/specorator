import { createMockEl } from '@test/helpers/mockElement';

// Mock the engine so the view's ChatViewHandle conformance can be exercised
// without constructing the real tab stack (controllers, runtimes, islands).
jest.mock('@/features/chat/tabs/TabManager', () => ({
  TabManager: jest.fn().mockImplementation(() => ({
    getPersistedState: jest.fn(() => ({ openTabs: [], activeTabId: null })),
    destroy: jest.fn().mockResolvedValue(undefined),
    invalidateProviderCommandCaches: jest.fn(),
    // Present so the onClose test can prove it is NOT the path taken.
    disposeAllRuntimes: jest.fn(),
  })),
}));

import { TabManager } from '@/features/chat/tabs/TabManager';
import { TeamChatView } from '@/features/teamChat/TeamChatView';

/** Prototype-only view wired just enough to drive the engine seam + persistence
 *  (mirrors SpecoratorView.test's harness). */
function makeView(): any {
  const view = Object.create(TeamChatView.prototype) as any;
  view.plugin = {};
  view.leaf = { setViewState: jest.fn().mockResolvedValue(undefined) };
  view.contentEl = createMockEl();
  view.tabContentEl = createMockEl();
  view.tabManager = null;
  view.tabsRestored = false;
  view.selectedAgentId = null;
  view.pendingPersist = null;
  view.vueApp = null;
  view.teamChatObservers = new Set();
  return view;
}

describe('TeamChatView — ChatViewHandle conformance', () => {
  beforeEach(() => jest.clearAllMocks());

  it('getTabManager returns the constructed manager after the host mounts', () => {
    const view = makeView();
    expect(view.getTabManager()).toBeNull();
    expect(view.areTabsRestored()).toBe(false);

    view.initTabEngine();

    expect(TabManager).toHaveBeenCalledTimes(1);
    expect(view.getTabManager()).not.toBeNull();
    // Enumerable immediately so getAllViews() (T4) can reach it.
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

  it('selectAgent seeds selectedAgentId for the getState round-trip', async () => {
    const view = makeView();
    // No engine on this prototype view, so selectAgent records the selection and
    // returns without opening a tab; the sync record is all getState needs.
    await view.selectAgent('roster:y');
    expect(view.getState().selectedAgentId).toBe('roster:y');
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
