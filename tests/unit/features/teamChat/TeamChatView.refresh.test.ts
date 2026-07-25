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

import { ChatState } from '@/features/chat/state/ChatState';
import { resolveTeamChatAgentProvider } from '@/features/teamChat/resolveTeamChatAgentProvider';
import { TeamChatView } from '@/features/teamChat/TeamChatView';

const mockResolveProvider = resolveTeamChatAgentProvider as jest.Mock;

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
