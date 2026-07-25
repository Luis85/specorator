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
  view.teamChatObservers = new Set();
  return view;
}

describe('TeamChatView.selectAgent — resolve → cross-view reuse / create', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNotice.mockClear();
  });

  it('records selectedAgentId and projects it to observers synchronously, before the async open', async () => {
    const observer = jest.fn();
    const view = makeView();
    view.teamChatObservers = new Set([observer]);
    view.tabManager = {
      createTab: jest.fn().mockResolvedValue({ id: 'tab-1' }),
      switchToTab: jest.fn(),
    };

    const pending = view.selectAgent('roster:z');
    // Selection is recorded + projected up-front so the roster highlights and the
    // right-pane empty state clears immediately, not after the conversation resolves.
    expect(view.selectedAgentId).toBe('roster:z');
    expect(observer).toHaveBeenCalledWith({ selectedAgentId: 'roster:z' });
    await pending;
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

  // Fix A (new): two overlapping selects for the SAME agent (rapid double-click,
  // or simultaneous clicks in two leaves sharing the plugin-scoped coordinator)
  // must collapse — resolveOrCreate serializes only the mapping, so without the
  // open-coordinator both would see findConversationAcrossViews==null and each
  // createTab, double-mounting one DM.
  it('serializes overlapping selects of the same DM: createTab runs once, the second switches (Fix A)', async () => {
    let createdTabId: string | null = null;
    const thisLeaf = { id: 'leaf-this' };
    const switchToTab = jest.fn().mockResolvedValue(undefined);
    // createTab registers the tab only AFTER a yield, so a racing second caller
    // can't observe it synchronously (models real tab-creation latency).
    const createTab = jest.fn().mockImplementation(async () => {
      await Promise.resolve();
      createdTabId = 'tab-1';
      return { id: 'tab-1' };
    });
    const store = { resolveOrCreate: jest.fn().mockResolvedValue('conv-1') };
    const view = makeView({
      leaf: thisLeaf,
      plugin: {
        getTeamChatThreadStore: () => store,
        findConversationAcrossViews: jest.fn(() =>
          createdTabId
            ? { view: { leaf: thisLeaf, getTabManager: () => ({ switchToTab }) }, tabId: createdTabId }
            : null),
      },
    });
    view.tabManager = { createTab, switchToTab };

    await Promise.all([view.selectAgent('roster:a'), view.selectAgent('roster:a')]);

    expect(createTab).toHaveBeenCalledTimes(1);
    // The queued second caller re-ran the open, found the just-created tab, and switched.
    expect(switchToTab).toHaveBeenCalledWith('tab-1');
  });

  // Fix B (new): the source leaf never opened a tab for this agent (the DM lives
  // in another leaf), so its optimistic selection must roll back or the roster
  // highlight + empty state desync against the still-showing prior transcript.
  it('rolls the source leaf selection back to its prior value on a cross-view reveal (Fix B)', async () => {
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
    view.selectedAgentId = 'roster:prev'; // a DM was already showing in this leaf
    view.teamChatObservers = new Set([observer]);
    view.tabManager = { createTab, switchToTab: jest.fn() };

    await view.selectAgent('roster:new');

    // Source-leaf selection is restored so its projection matches its visible pane.
    expect(view.selectedAgentId).toBe('roster:prev');
    // The owning leaf is revealed + switched; this leaf never double-mounts.
    expect(revealLeaf).toHaveBeenCalledWith(otherLeaf);
    expect(otherSwitch).toHaveBeenCalledWith('tab-9');
    expect(createTab).not.toHaveBeenCalled();
    // Optimistic set to the clicked agent, then rolled back to the prior one.
    expect(observer).toHaveBeenNthCalledWith(1, { selectedAgentId: 'roster:new' });
    expect(observer).toHaveBeenLastCalledWith({ selectedAgentId: 'roster:prev' });
  });

  it('reverts the selection, re-emits, and shows a Notice when createTab hits the tab cap', async () => {
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

    // Selection rolls back to the prior agent so the roster highlight tracks the pane.
    expect(view.selectedAgentId).toBe('roster:prev');
    // Two projections: the optimistic set, then the revert.
    expect(observer).toHaveBeenCalledTimes(2);
    expect(observer).toHaveBeenNthCalledWith(1, { selectedAgentId: 'roster:new' });
    expect(observer).toHaveBeenNthCalledWith(2, { selectedAgentId: 'roster:prev' });
    // The user is told why nothing opened.
    expect(mockNotice).toHaveBeenCalledTimes(1);
  });
});
