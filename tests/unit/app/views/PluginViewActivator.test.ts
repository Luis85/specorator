import { PluginViewActivator } from '@/app/views/PluginViewActivator';
import { VIEW_TYPE_SPECORATOR } from '@/core/types';
import { VIEW_TYPE_TEAM_CHAT } from '@/features/teamChat/viewType';
import type SpecoratorPlugin from '@/main';

function createPlugin(opts: {
  existingViewLeaves?: unknown[];
  hasLiveView?: boolean;
  tabManager?: {
    canCreateTab?: (kind?: 'chat' | 'work-order') => boolean;
    getTabCount?: () => number;
    countTabsByKind?: (kind: 'chat' | 'work-order') => number;
  } | null;
  lastKnownOpenTabs?: Array<{ tabId: string; conversationId: string | null; kind?: 'chat' | 'work-order' }>;
  lastKnownOpenTabCount?: number;
  maxChatTabs?: number;
  agentBoardQueueCap?: number;
  pendingReservations?: number;
  tabsRestored?: boolean;
  placement?: 'main-tab' | 'left-sidebar' | 'right-sidebar';
} = {}) {
  const leaves = opts.existingViewLeaves ?? [];
  const view = opts.hasLiveView
    ? {
        getTabManager: () => opts.tabManager ?? null,
        areTabsRestored: () => opts.tabsRestored ?? true,
        createNewTab: jest.fn().mockResolvedValue(undefined),
        leaf: { view: { getViewType: () => VIEW_TYPE_SPECORATOR } },
      }
    : null;
  const newLeafTab = { setViewState: jest.fn().mockResolvedValue(undefined) };
  const plugin = {
    app: {
      workspace: {
        getLeavesOfType: jest.fn((type: string) =>
          type === VIEW_TYPE_SPECORATOR ? leaves : [],
        ),
        getLeaf: jest.fn().mockReturnValue(newLeafTab),
        getLeftLeaf: jest.fn().mockReturnValue(newLeafTab),
        getRightLeaf: jest.fn().mockReturnValue(newLeafTab),
        revealLeaf: jest.fn(),
      },
    },
    settings: {
      chatViewPlacement: opts.placement ?? 'main-tab',
      maxChatTabs: opts.maxChatTabs ?? 3,
      agentBoardQueueCap: opts.agentBoardQueueCap ?? 3,
    },
    getView: jest.fn().mockReturnValue(view),
    getAllViews: jest.fn().mockReturnValue(view ? [view] : []),
    lastKnownTabManagerState: {
      openTabs: opts.lastKnownOpenTabs
        ?? new Array(opts.lastKnownOpenTabCount ?? 0).fill({ tabId: 'tab', conversationId: null }),
    },
    chatTabReservations: { pending: opts.pendingReservations ?? 0 },
    activateView: jest.fn(),
  } as unknown as SpecoratorPlugin;
  return { plugin, newLeafTab };
}

describe('PluginViewActivator.canCreateNewTab', () => {
  it('uses tabManager.canCreateTab("chat") when a live view exists', () => {
    const { plugin } = createPlugin({
      hasLiveView: true,
      tabManager: { canCreateTab: () => false },
    });
    const activator = new PluginViewActivator(plugin);
    expect(activator.canCreateNewTab()).toBe(false);
  });

  it('honors maxChatTabs clamp [3,10] when relying on last-known state', () => {
    const { plugin } = createPlugin({ lastKnownOpenTabCount: 9, maxChatTabs: 12 });
    const activator = new PluginViewActivator(plugin);
    expect(activator.canCreateNewTab()).toBe(true);
  });

  it('clamps minimum to 3', () => {
    const { plugin } = createPlugin({ lastKnownOpenTabCount: 2, maxChatTabs: 1 });
    const activator = new PluginViewActivator(plugin);
    expect(activator.canCreateNewTab()).toBe(true);
  });

  it('returns false when leaves exist but no live view', () => {
    const { plugin } = createPlugin({ existingViewLeaves: [{}] });
    const activator = new PluginViewActivator(plugin);
    expect(activator.canCreateNewTab()).toBe(false);
  });
});

describe('PluginViewActivator.openNewTab', () => {
  it('opens a new tab on the existing view when one is live', async () => {
    const { plugin } = createPlugin({ hasLiveView: true, tabManager: null });
    const activator = new PluginViewActivator(plugin);

    await activator.openNewTab();

    const view = plugin.getView();
    expect(view?.createNewTab).toHaveBeenCalled();
  });

  it('does not stack a tab when restoredTabCount is 0', async () => {
    const { plugin, newLeafTab } = createPlugin({ lastKnownOpenTabCount: 0 });
    const liveView = { createNewTab: jest.fn().mockResolvedValue(undefined), getTabManager: () => null };
    (plugin.getView as jest.Mock)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(null)
      .mockReturnValue(liveView);
    const activator = new PluginViewActivator(plugin);
    (plugin.activateView as jest.Mock).mockImplementation(() => activator.activateView());

    await activator.openNewTab();

    expect(liveView.createNewTab).not.toHaveBeenCalled();
    expect(newLeafTab.setViewState).toHaveBeenCalled();
  });
});

describe('PluginViewActivator.getTabSlotUsage (work-order budget)', () => {
  it('reports WO tab count and queue cap when a view is mounted', () => {
    const { plugin } = createPlugin({
      hasLiveView: true,
      tabManager: { countTabsByKind: (k) => (k === 'work-order' ? 1 : 4) },
      maxChatTabs: 4,
      agentBoardQueueCap: 3,
    });
    const activator = new PluginViewActivator(plugin);
    expect(activator.getTabSlotUsage()).toEqual({ used: 1, max: 3 });
  });

  it('adds pending reservations to WO usage', () => {
    const { plugin } = createPlugin({
      hasLiveView: true,
      tabManager: { countTabsByKind: (k) => (k === 'work-order' ? 1 : 0) },
      pendingReservations: 2,
      agentBoardQueueCap: 5,
    });
    const activator = new PluginViewActivator(plugin);
    expect(activator.getTabSlotUsage()).toEqual({ used: 3, max: 5 });
  });

  it('clamps WO max to the queue-cap range [1,8]', () => {
    const { plugin } = createPlugin({ agentBoardQueueCap: 99 });
    const activator = new PluginViewActivator(plugin);
    expect(activator.getTabSlotUsage().max).toBe(8);
  });

  it('reports no free capacity while a mounted view is still restoring its tabs', () => {
    const { plugin } = createPlugin({
      hasLiveView: true,
      existingViewLeaves: [{}],
      tabManager: { countTabsByKind: () => 0 },
      tabsRestored: false,
      agentBoardQueueCap: 5,
    });
    const activator = new PluginViewActivator(plugin);
    expect(activator.getTabSlotUsage()).toEqual({ used: 5, max: 5 });
  });

  it('reports no free capacity while a Specorator leaf is mid-mount (no tab manager yet)', () => {
    const { plugin } = createPlugin({
      existingViewLeaves: [{}],
      lastKnownOpenTabCount: 0,
      agentBoardQueueCap: 5,
    });
    const activator = new PluginViewActivator(plugin);
    const usage = activator.getTabSlotUsage();
    expect(usage.max - usage.used).toBe(0);
  });

  it('counts persisted WO tabs for a deferred chat leaf at plugin startup', () => {
    const { plugin } = createPlugin({
      existingViewLeaves: [{ isDeferred: true }],
      lastKnownOpenTabs: [
        { tabId: 'chat-1', conversationId: null, kind: 'chat' },
        { tabId: 'chat-2', conversationId: null },
        { tabId: 'wo-1', conversationId: 'conv-1', kind: 'work-order' },
      ],
      pendingReservations: 1,
      agentBoardQueueCap: 5,
    });
    const activator = new PluginViewActivator(plugin);
    expect(activator.getTabSlotUsage()).toEqual({ used: 2, max: 5 });
  });

  it('reports only reservations when no view is mounted (no WO tabs live yet)', () => {
    const { plugin } = createPlugin({
      lastKnownOpenTabCount: 0,
      pendingReservations: 1,
      agentBoardQueueCap: 5,
    });
    const activator = new PluginViewActivator(plugin);
    expect(activator.getTabSlotUsage()).toEqual({ used: 1, max: 5 });
  });

  it('accepts queue cap=1 (below old MIN_TABS=3 floor)', () => {
    const { plugin } = createPlugin({
      hasLiveView: true,
      tabManager: { countTabsByKind: () => 0 },
      agentBoardQueueCap: 1,
    });
    const activator = new PluginViewActivator(plugin);
    expect(activator.getTabSlotUsage()).toEqual({ used: 0, max: 1 });
  });

  it('aggregates work-order tabs across every live Specorator view', () => {
    const viewA = {
      getTabManager: () => ({ countTabsByKind: (k: string) => (k === 'work-order' ? 1 : 0) }),
      areTabsRestored: () => true,
      leaf: { view: { getViewType: () => VIEW_TYPE_SPECORATOR } },
    };
    const viewB = {
      getTabManager: () => ({ countTabsByKind: (k: string) => (k === 'work-order' ? 2 : 0) }),
      areTabsRestored: () => true,
      leaf: { view: { getViewType: () => VIEW_TYPE_SPECORATOR } },
    };
    const { plugin } = createPlugin({ agentBoardQueueCap: 5 });
    (plugin.getAllViews as jest.Mock).mockReturnValue([viewA, viewB]);
    const activator = new PluginViewActivator(plugin);
    expect(activator.getTabSlotUsage()).toEqual({ used: 3, max: 5 });
  });

  it('reports full usage when any view is mid-restore, even alongside a restored view', () => {
    const restored = {
      getTabManager: () => ({ countTabsByKind: (k: string) => (k === 'work-order' ? 1 : 0) }),
      areTabsRestored: () => true,
      leaf: { view: { getViewType: () => VIEW_TYPE_SPECORATOR } },
    };
    const midRestore = {
      getTabManager: () => ({ countTabsByKind: () => 0 }),
      areTabsRestored: () => false, // tabs not hydrated yet — WO count unknown
      leaf: { view: { getViewType: () => VIEW_TYPE_SPECORATOR } },
    };
    const { plugin } = createPlugin({ agentBoardQueueCap: 5 });
    (plugin.getAllViews as jest.Mock).mockReturnValue([restored, midRestore]);
    const activator = new PluginViewActivator(plugin);
    // Must NOT report the restored view's count alone (used: 1) — block capacity.
    expect(activator.getTabSlotUsage()).toEqual({ used: 5, max: 5 });
  });

  it('excludes a mid-restore Team Chat leaf from the work-order slot gate', () => {
    // A Team Chat leaf hosts chat-kind DM tabs only — never a work-order run tab —
    // so its slow DM hydration must not trip the mid-restore block and stall the
    // Agent Board queue (Round-46).
    const sidebar = {
      getTabManager: () => ({ countTabsByKind: (k: string) => (k === 'work-order' ? 1 : 0) }),
      areTabsRestored: () => true,
      leaf: { view: { getViewType: () => VIEW_TYPE_SPECORATOR } },
    };
    const teamChatMidRestore = {
      getTabManager: () => null,
      areTabsRestored: () => false,
      leaf: { view: { getViewType: () => VIEW_TYPE_TEAM_CHAT } },
    };
    const { plugin } = createPlugin({ agentBoardQueueCap: 5 });
    (plugin.getAllViews as jest.Mock).mockReturnValue([sidebar, teamChatMidRestore]);
    const activator = new PluginViewActivator(plugin);
    expect(activator.getTabSlotUsage()).toEqual({ used: 1, max: 5 });
  });

  it('still blocks capacity while the sidebar view itself is mid-restore', () => {
    const sidebarMidRestore = {
      getTabManager: () => ({ countTabsByKind: () => 0 }),
      areTabsRestored: () => false,
      leaf: { view: { getViewType: () => VIEW_TYPE_SPECORATOR } },
    };
    const { plugin } = createPlugin({ agentBoardQueueCap: 5 });
    (plugin.getAllViews as jest.Mock).mockReturnValue([sidebarMidRestore]);
    const activator = new PluginViewActivator(plugin);
    expect(activator.getTabSlotUsage()).toEqual({ used: 5, max: 5 });
  });

  it('a restored Team Chat leaf contributes zero work-order tabs', () => {
    const sidebar = {
      getTabManager: () => ({ countTabsByKind: (k: string) => (k === 'work-order' ? 2 : 0) }),
      areTabsRestored: () => true,
      leaf: { view: { getViewType: () => VIEW_TYPE_SPECORATOR } },
    };
    const teamChatRestored = {
      getTabManager: () => ({ countTabsByKind: () => 0 }),
      areTabsRestored: () => true,
      leaf: { view: { getViewType: () => VIEW_TYPE_TEAM_CHAT } },
    };
    const { plugin } = createPlugin({ agentBoardQueueCap: 5 });
    (plugin.getAllViews as jest.Mock).mockReturnValue([sidebar, teamChatRestored]);
    const activator = new PluginViewActivator(plugin);
    expect(activator.getTabSlotUsage()).toEqual({ used: 2, max: 5 });
  });

  it('counts deferred sidebar WO tabs even when a live Team Chat view exists', () => {
    // Regression (Round-47): a live Team Chat leaf makes getAllViews() non-empty, yet it hosts
    // only chat-kind DM tabs — never a work-order run tab. A deferred VIEW_TYPE_SPECORATOR leaf
    // is not yet instantiated (so absent from getAllViews) but still restores its persisted WO
    // tabs later. The Team Chat view must not mask that deferred sidebar's persisted budget, or
    // the queue reads free capacity and over-launches before the sidebar restores.
    const teamChatLive = {
      getTabManager: () => ({ countTabsByKind: () => 0 }),
      areTabsRestored: () => true,
      leaf: { view: { getViewType: () => VIEW_TYPE_TEAM_CHAT } },
    };
    const { plugin } = createPlugin({
      existingViewLeaves: [{ isDeferred: true }],
      lastKnownOpenTabs: [
        { tabId: 'chat-1', conversationId: null, kind: 'chat' },
        { tabId: 'wo-1', conversationId: 'conv-1', kind: 'work-order' },
        { tabId: 'wo-2', conversationId: 'conv-2', kind: 'work-order' },
        { tabId: 'wo-3', conversationId: 'conv-3', kind: 'work-order' },
      ],
      pendingReservations: 1,
      agentBoardQueueCap: 5,
    });
    (plugin.getAllViews as jest.Mock).mockReturnValue([teamChatLive]);
    const activator = new PluginViewActivator(plugin);
    // 3 persisted WO tabs + 1 pending reservation; pre-fix this wrongly returned { used: 1 }.
    expect(activator.getTabSlotUsage()).toEqual({ used: 4, max: 5 });
  });

  it('blocks capacity when a deferred sidebar leaf coexists with a LIVE restored sidebar host (Round-50)', () => {
    // Second hole in the Round-47 fix: a LIVE restored VIEW_TYPE_SPECORATOR host makes
    // workOrderHosts non-empty, so the deferred-recovery branch (workOrderHosts.length === 0) is
    // skipped and the loop counts only the live manager's WO tabs — missing a SEPARATE deferred
    // sidebar leaf whose persisted WO tabs restore later. getLastKnownOpenTabCountFor reads a single
    // plugin-level state (ambiguous across leaves), so we can't sum it; instead treat the deferred
    // leaf like a mid-restore host and report full usage so the queue waits.
    const liveSidebar = {
      getTabManager: () => ({ countTabsByKind: (k: string) => (k === 'work-order' ? 1 : 0) }),
      areTabsRestored: () => true,
      leaf: { view: { getViewType: () => VIEW_TYPE_SPECORATOR } },
    };
    const { plugin } = createPlugin({
      existingViewLeaves: [{ isDeferred: false }, { isDeferred: true }],
      pendingReservations: 1,
      agentBoardQueueCap: 5,
    });
    (plugin.getAllViews as jest.Mock).mockReturnValue([liveSidebar]);
    const activator = new PluginViewActivator(plugin);
    // Pre-fix this wrongly returned { used: 2 } (live WO 1 + pending 1), masking the deferred
    // leaf's uncountable WO tabs; the queue could then over-launch before it restores.
    expect(activator.getTabSlotUsage()).toEqual({ used: 5, max: 5 });
  });
});
