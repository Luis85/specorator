import { createMockEl } from '@test/helpers/mockElement';

// Stub only vue's createApp so importing the view never tries a real mount; keep
// the rest of vue real (markRaw + pinia internals) via requireActual.
jest.mock('vue', () => {
  const actual = jest.requireActual('vue');
  return { ...actual, createApp: jest.fn(() => ({ use: jest.fn(), provide: jest.fn(), mount: jest.fn(), unmount: jest.fn() })) };
});

// Mock the engine so refresh methods can be driven off a hand-wired tabManager
// without constructing the real tab stack (mirror of TeamChatView.test).
jest.mock('@/features/chat/tabs/TabManager', () => ({
  TabManager: jest.fn().mockImplementation(() => ({ getAllTabs: jest.fn(() => []) })),
}));

// Leaf collaborators the DM-scoped refresh helpers call. Mocking these (not the
// helper itself) lets the REAL per-tab loops run so each test asserts the actual
// per-tab effect (composer re-project, usage recompute, edited-files clear/derive,
// provider rotation) — not a bare re-project.
jest.mock('@/features/chat/tabs/tabProviderSync', () => ({
  onProviderAvailabilityChanged: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/features/chat/tabs/providerResolution', () => ({
  getTabProviderId: jest.fn(() => 'claude'),
}));
jest.mock('@/core/providers/ProviderSettingsCoordinator', () => ({
  ProviderSettingsCoordinator: {
    getProviderSettingsSnapshot: jest.fn(() => ({ model: 'claude-new', customContextLimits: {} })),
  },
}));
jest.mock('@/core/providers/ProviderRegistry', () => ({
  ProviderRegistry: { getChatUIConfig: jest.fn(() => ({})) },
}));
jest.mock('@/features/settings/customModels/resolveModelContextWindow', () => ({
  resolveModelContextWindow: jest.fn(() => 200000),
}));
// requireActual keeps mergeEditedFileEntry (ChatState needs it); only the transcript
// rebuild is stubbed so the "enabled" branch has a deterministic derived list.
jest.mock('@/features/chat/utils/editedFiles', () => ({
  ...jest.requireActual('@/features/chat/utils/editedFiles'),
  deriveEditedFilesFromMessages: jest.fn(() => [{ path: 'derived.md', changeKind: 'created' }]),
}));
jest.mock('@/features/teamChat/resolveTeamChatAgentProvider', () => ({
  resolveTeamChatAgentProvider: jest.fn(),
}));

import { Notice } from 'obsidian';

import { ChatState } from '@/features/chat/state/ChatState';
import { resolveTeamChatAgentProvider } from '@/features/teamChat/resolveTeamChatAgentProvider';
import { noticeRemovedAgentDms } from '@/features/teamChat/teamChatDmRefresh';
import { TeamChatView } from '@/features/teamChat/TeamChatView';
import { t } from '@/i18n/i18n';

const mockResolveProvider = resolveTeamChatAgentProvider as jest.Mock;
const mockNotice = Notice as jest.Mock;

/** Prototype-only view wired just enough to drive the refresh surface. */
function makeView(): any {
  const view = Object.create(TeamChatView.prototype) as any;
  view.plugin = {
    logger: { scope: () => ({ error: jest.fn() }) },
    getConversationSync: jest.fn(() => null),
    events: { emit: jest.fn() },
    settings: { showAgentEditedFiles: true },
    app: {},
    // buildPresence projects across every leaf's streaming tabs (Round-35 Fix 3);
    // one leaf here, reading this view's own (possibly-reassigned) tab manager.
    getAllViews: () => [{ getTabManager: () => view.tabManager }],
  };
  view.leaf = { setViewState: jest.fn().mockResolvedValue(undefined) };
  view.contentEl = createMockEl();
  view.selectedAgentId = null;
  view.dmRecency = []; // LRU recency array (T7); class-field initializer skipped by Object.create
  view.removedAgentDmsNotified = new Set(); // agent-removed dedupe (Round-39); ditto
  view.tabManager = {
    getAllTabs: jest.fn(() => []),
    getActiveTab: jest.fn(() => null),
    primeProviderRuntime: jest.fn(),
  };
  view.teamChatObservers = new Set();
  return view;
}

describe('TeamChatView.refreshModelSelector — DM-scoped model/usage refresh', () => {
  beforeEach(() => jest.clearAllMocks());

  it('re-projects each open DM composer and recomputes its model-dependent usage', () => {
    const view = makeView();
    const emit = jest.fn();
    const tab = {
      conversationId: 'c1',
      lifecycleState: 'ready',
      providerId: 'claude',
      state: {
        usage: { model: 'old-model', contextWindow: 1, contextTokens: 100, percentage: 100, contextWindowIsAuthoritative: false },
        editedFiles: [],
        isStreaming: false,
      },
      composer: { emit },
    };
    view.tabManager.getAllTabs = jest.fn(() => [tab]);

    view.refreshModelSelector();

    // The composer island re-projects (model selector repaints from the store)...
    expect(emit).toHaveBeenCalled();
    // ...and the usage is recomputed for the tab's current model + context window,
    // not left pointing at the stale model (the real per-tab effect).
    expect(tab.state.usage.model).toBe('claude-new');
    expect(tab.state.usage.contextWindow).toBe(200000);
    // The view owns the surrounding prime + store re-project (mirror of SpecoratorView).
    expect(view.tabManager.primeProviderRuntime).toHaveBeenCalledTimes(1);
  });

  it('does not throw and still re-projects when no engine is present', () => {
    const view = makeView();
    view.tabManager = null;
    const observer = jest.fn();
    view.teamChatObservers = new Set([observer]);

    expect(() => view.refreshModelSelector()).not.toThrow();
    expect(observer).toHaveBeenCalled();
  });
});

describe('TeamChatView.applyEditedFilesSetting — DM-scoped clear/derive', () => {
  beforeEach(() => jest.clearAllMocks());

  it('clears each open DM edited-files strip when the setting is disabled', () => {
    const view = makeView();
    view.plugin.settings = { showAgentEditedFiles: false };
    const state = new ChatState();
    state.recordEditedFile({ path: 'a.md', changeKind: 'edited' });
    view.tabManager.getAllTabs = jest.fn(() => [{ state }]);

    view.applyEditedFilesSetting();

    // Cleared so BOTH the composer and top-bar strips (same tab.state.editedFiles) hide.
    expect(state.editedFiles).toEqual([]);
  });

  it('rebuilds each open DM strip from the transcript when re-enabled', () => {
    const view = makeView();
    view.plugin.settings = { showAgentEditedFiles: true };
    const state = new ChatState();
    view.tabManager.getAllTabs = jest.fn(() => [{ state }]);

    view.applyEditedFilesSetting();

    expect(state.editedFiles).toEqual([{ path: 'derived.md', changeKind: 'created' }]);
  });
});

describe('TeamChatView.refreshProviderAvailability — un-grey + agent-provider revalidation', () => {
  beforeEach(() => jest.clearAllMocks());

  /** Two open DMs: agent A re-pointed at codex (its DM still on claude → stale),
   *  agent B unchanged (claude === claude → fine). */
  function twoDmView(): any {
    const view = makeView();
    view.tabManager.getAllTabs = jest.fn(() => [
      { conversationId: 'c-a', state: {}, composer: { emit: jest.fn() } },
      { conversationId: 'c-b', state: {}, composer: { emit: jest.fn() } },
    ]);
    view.plugin.getConversationSync = jest.fn((id: string) =>
      id === 'c-a'
        ? { boundAgentId: 'roster:a', providerId: 'claude' }
        : { boundAgentId: 'roster:b', providerId: 'claude' });
    mockResolveProvider.mockImplementation(async (_plugin: unknown, agentId: string) =>
      agentId === 'roster:a' ? 'codex' : 'claude');
    return view;
  }

  it('rotates a DM whose agent was re-pointed at another provider, leaving matching DMs untouched', async () => {
    const view = twoDmView();
    const selectAgent = jest.spyOn(view, 'selectAgent').mockResolvedValue(undefined);

    await view.refreshProviderAvailability();

    // The stale DM rotates through the shared selectAgent path (notice + old-tab close
    // apply there); the matching DM is never rotated (idempotent).
    expect(selectAgent).toHaveBeenCalledTimes(1);
    expect(selectAgent).toHaveBeenCalledWith('roster:a');
  });

  it('re-projects each open DM composer so a newly enabled provider un-greys it', async () => {
    const view = makeView();
    const emit = jest.fn();
    view.tabManager.getAllTabs = jest.fn(() => [
      { conversationId: 'c-a', state: {}, composer: { emit } },
    ]);
    view.plugin.getConversationSync = jest.fn(() => ({ boundAgentId: 'roster:a', providerId: 'claude' }));
    mockResolveProvider.mockResolvedValue('claude'); // provider matches → no rotation
    jest.spyOn(view, 'selectAgent').mockResolvedValue(undefined);

    await view.refreshProviderAvailability();

    expect(emit).toHaveBeenCalled();
  });

  it('never rotates a DM whose agent is unknown (no resolved provider to rotate toward)', async () => {
    const view = makeView();
    view.tabManager.getAllTabs = jest.fn(() => [{ conversationId: 'c-a', state: {}, composer: { emit: jest.fn() } }]);
    view.plugin.getConversationSync = jest.fn(() => ({ boundAgentId: 'roster:gone', providerId: 'claude' }));
    mockResolveProvider.mockResolvedValue(undefined); // deleted roster entry
    const selectAgent = jest.spyOn(view, 'selectAgent').mockResolvedValue(undefined);

    await view.refreshProviderAvailability();

    expect(selectAgent).not.toHaveBeenCalled();
  });

  it('resolves without throwing when no engine is present', async () => {
    const view = makeView();
    view.tabManager = null;
    await expect(view.refreshProviderAvailability()).resolves.toBeUndefined();
  });
});

describe('TeamChatView.refreshTabControls / updateLayoutForPosition — re-project', () => {
  beforeEach(() => jest.clearAllMocks());

  // Team Chat has no header tab-strip or tab-bar-position knob, so (like
  // SpecoratorView's own bare-re-project bodies) a store re-projection is the
  // faithful mirror.
  it('re-projects the store', () => {
    const view = makeView();
    const observer = jest.fn();
    view.teamChatObservers = new Set([observer]);

    view.refreshTabControls();
    view.updateLayoutForPosition();

    expect(observer).toHaveBeenCalledTimes(2);
  });
});

// Round-39 Concern A: TeamChatView reacts to `roster:changed` for its OPEN DM tabs —
// (b) the reused T5 reconcile (refreshProviderAvailability: un-grey + provider rotation)
// AND (a) read-only handling for DMs whose bound agent was deleted from the roster.
describe('TeamChatView.reconcileDmsOnRosterChange — roster:changed reconcile', () => {
  beforeEach(() => jest.clearAllMocks());

  it('runs the T5 provider reconcile AND surfaces the removal notice for a deleted-agent DM', async () => {
    const view = makeView();
    // Two open DMs: roster:live (agent still present), roster:gone (agent deleted).
    view.tabManager.getAllTabs = jest.fn(() => [
      { conversationId: 'c-live', state: {}, composer: { emit: jest.fn() } },
      { conversationId: 'c-gone', state: {}, composer: { emit: jest.fn() } },
    ]);
    view.plugin.getConversationSync = jest.fn((id: string) =>
      id === 'c-live'
        ? { surface: 'team-chat', boundAgentId: 'roster:live', providerId: 'claude' }
        : { surface: 'team-chat', boundAgentId: 'roster:gone', providerId: 'claude' });
    view.plugin.agentRosterStore = { list: jest.fn().mockResolvedValue([{ id: 'roster:live' }]) };
    // The (b) reconcile is exercised by its own suite above; here assert it is invoked.
    const refreshSpy = jest.spyOn(view, 'refreshProviderAvailability').mockResolvedValue(undefined);

    await view.reconcileDmsOnRosterChange();

    expect(refreshSpy).toHaveBeenCalledTimes(1);
    // Only the deleted-agent DM goes read-only (its notice fires); the live DM is untouched.
    expect(mockNotice).toHaveBeenCalledWith(t('teamChat.agentRemoved'));
    expect(mockNotice).toHaveBeenCalledTimes(1);
  });

  it('does not re-notice an already-flagged removed DM on a later roster:changed (deduped)', async () => {
    const view = makeView();
    view.tabManager.getAllTabs = jest.fn(() => [{ conversationId: 'c-gone', state: {}, composer: { emit: jest.fn() } }]);
    view.plugin.getConversationSync = jest.fn(() => ({ surface: 'team-chat', boundAgentId: 'roster:gone', providerId: 'claude' }));
    view.plugin.agentRosterStore = { list: jest.fn().mockResolvedValue([]) };
    jest.spyOn(view, 'refreshProviderAvailability').mockResolvedValue(undefined);

    await view.reconcileDmsOnRosterChange();
    await view.reconcileDmsOnRosterChange();

    expect(mockNotice).toHaveBeenCalledTimes(1); // flagged once, not on every subsequent edit
  });

  it('logs (never rejects) when the reconcile throws', async () => {
    const view = makeView();
    view.tabManager.getAllTabs = jest.fn(() => []);
    jest.spyOn(view, 'refreshProviderAvailability').mockRejectedValue(new Error('boom'));

    await expect(view.reconcileDmsOnRosterChange()).resolves.toBeUndefined();
  });
});

// Round-42: after a deferred/closed leaf restores its DM tabs, no startup event guarantees a
// provider reconcile (the live roster:changed path only covers edits made while open). So
// restoreTabsThenMarkReady runs refreshProviderAvailability over the restored DMs — a DM whose
// agent now resolves to a different provider rotates to a fresh conversation on the new
// provider; a matching-provider DM is left untouched.
describe('TeamChatView — restored DM provider reconcile (Round-42, :329)', () => {
  beforeEach(() => jest.clearAllMocks());

  /** A view whose engine already holds two RESTORED DMs: agent A re-pointed at codex (its DM
   *  still on claude → stale), agent B unchanged (claude === claude → fine). */
  function restoredView(): any {
    const view = makeView();
    view.pendingTabManagerState = null; // restore itself is covered elsewhere; drive the POST-restore reconcile
    view.tabsRestored = false;
    view.tabManager.getAllTabs = jest.fn(() => [
      { conversationId: 'c-a', state: {}, composer: { emit: jest.fn() } },
      { conversationId: 'c-b', state: {}, composer: { emit: jest.fn() } },
    ]);
    view.tabManager.getActiveTab = jest.fn(() => null);
    view.tabManager.getTabCount = jest.fn(() => 2);       // read by tabCountsPayload in the finally
    view.tabManager.countTabsByKind = jest.fn(() => 2);
    view.plugin.getConversationSync = jest.fn((id: string) =>
      id === 'c-a'
        ? { boundAgentId: 'roster:a', providerId: 'claude' }
        : { boundAgentId: 'roster:b', providerId: 'claude' });
    mockResolveProvider.mockImplementation(async (_plugin: unknown, agentId: string) =>
      agentId === 'roster:a' ? 'codex' : 'claude');
    return view;
  }

  it('rotates a restored DM whose agent now resolves to a different provider, leaving a matching DM untouched', async () => {
    const view = restoredView();
    const selectAgent = jest.spyOn(view, 'selectAgent').mockResolvedValue(undefined);

    await view.restoreTabsThenMarkReady();

    // The stale-provider DM rotates through selectAgent (fresh conversation on the new provider);
    // the matching-provider DM is never rotated.
    expect(selectAgent).toHaveBeenCalledTimes(1);
    expect(selectAgent).toHaveBeenCalledWith('roster:a');
    // The reconcile ran AFTER the restore gate opened, so selectAgent's own !tabsRestored gate
    // would not have short-circuited the rotation.
    expect(view.areTabsRestored()).toBe(true);
  });

  it('does not rotate a superseded restore (manager swapped mid-restore)', async () => {
    const view = restoredView();
    const selectAgent = jest.spyOn(view, 'selectAgent').mockResolvedValue(undefined);
    // restoreTabsThenMarkReady captures this.tabManager at entry; a re-entrant rebuild swaps it
    // during the (immediate) restore, so the manager-identity guard must skip BOTH the readiness
    // publish AND the reconcile.
    const original = view.tabManager;
    view.restoreTabs = jest.fn(async () => { view.tabManager = { ...original }; });

    await view.restoreTabsThenMarkReady();

    expect(selectAgent).not.toHaveBeenCalled();
    expect(view.areTabsRestored()).toBe(false);
  });
});

// Direct coverage of the deleted-agent detection helper: notice once per newly-removed DM,
// clear the flag when the agent re-appears, and leave non-team-chat / bound-less tabs alone.
describe('noticeRemovedAgentDms — deleted-agent read-only surfacing', () => {
  beforeEach(() => jest.clearAllMocks());

  function pluginWith(live: string[]): any {
    return {
      agentRosterStore: { list: jest.fn().mockResolvedValue(live.map((id) => ({ id }))) },
      getConversationSync: jest.fn((id: string) =>
        id === 'dm-gone'
          ? { surface: 'team-chat', boundAgentId: 'roster:gone' }
          : id === 'dm-live'
            ? { surface: 'team-chat', boundAgentId: 'roster:live' }
            : { surface: 'chat' }), // a sidebar conversation
    };
  }

  it('re-notices after the agent is re-created under the same id (flag cleared)', async () => {
    const plugin = pluginWith([]); // roster:gone absent
    const tabs = [{ conversationId: 'dm-gone' }];
    const notified = new Set<string>();

    await noticeRemovedAgentDms(plugin, tabs as any, notified);
    expect(mockNotice).toHaveBeenCalledTimes(1);
    expect(notified.has('dm-gone')).toBe(true);

    // Agent re-created → present in the roster → the flag clears so a future deletion re-notices.
    plugin.agentRosterStore.list = jest.fn().mockResolvedValue([{ id: 'roster:gone' }]);
    await noticeRemovedAgentDms(plugin, tabs as any, notified);
    expect(notified.has('dm-gone')).toBe(false);
    expect(mockNotice).toHaveBeenCalledTimes(1); // no new notice while present
  });

  it('ignores non-team-chat tabs and DMs whose agent still exists', async () => {
    const plugin = pluginWith(['roster:live']);
    const tabs = [{ conversationId: 'dm-live' }, { conversationId: 'sidebar-1' }];

    await noticeRemovedAgentDms(plugin, tabs as any, new Set());

    expect(mockNotice).not.toHaveBeenCalled();
  });
});
