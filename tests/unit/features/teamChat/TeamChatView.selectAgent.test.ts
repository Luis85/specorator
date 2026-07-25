import { createMockEl } from '@test/helpers/mockElement';

// Mock the engine so selectAgent's resolve→open/switch flow can be exercised
// without constructing the real tab stack (mirror of TeamChatView.test).
jest.mock('@/features/chat/tabs/TabManager', () => ({
  TabManager: jest.fn().mockImplementation(() => ({
    getPersistedState: jest.fn(() => ({ openTabs: [], activeTabId: null })),
    destroy: jest.fn().mockResolvedValue(undefined),
  })),
}));

// Isolate the roster-policy assertion from the full provider registration: the
// real resolveAgentProvider runs (so the override→model-provider→fallback logic
// is under test), only the enabled-set + default-provider are stubbed.
jest.mock('@/core/providers/ProviderRegistry', () => ({
  ProviderRegistry: {
    isEnabled: jest.fn(() => true),
    resolveSettingsProviderId: jest.fn(() => 'claude'),
  },
}));

import { TeamChatView } from '@/features/teamChat/TeamChatView';

/** Prototype-only view wired just enough to drive selectAgent + createDmConversation. */
function makeView(overrides: { plugin?: Record<string, unknown> } = {}): any {
  const view = Object.create(TeamChatView.prototype) as any;
  view.plugin = {
    logger: { scope: () => ({ error: jest.fn() }) },
    ...overrides.plugin,
  };
  view.contentEl = createMockEl();
  view.tabManager = null;
  view.selectedAgentId = null;
  view.teamChatThreadStore = null;
  view.teamChatObservers = new Set();
  return view;
}

function fakeAgent(overrides: Record<string, unknown>): any {
  return {
    id: 'roster:a', name: 'A', description: '', prompt: '',
    disallowedTools: [], skills: [], roles: ['worker'],
    createdAt: 1, updatedAt: 2, ...overrides,
  };
}

describe('TeamChatView.selectAgent — resolve → open / switch', () => {
  beforeEach(() => jest.clearAllMocks());

  it('resolves the DM then CREATES a tab the first time, SWITCHES the second (no re-create)', async () => {
    const resolveOrCreate = jest.fn().mockResolvedValue('conv-1');
    const createTab = jest.fn().mockResolvedValue({ id: 'tab-1' });
    const switchToTab = jest.fn().mockResolvedValue(undefined);
    let openTab: { tabId: string } | null = null;

    const view = makeView();
    view.teamChatThreadStore = { resolveOrCreate };
    view.tabManager = {
      findTabByConversation: jest.fn(() => openTab),
      createTab,
      switchToTab,
    };

    await view.selectAgent('roster:a');
    expect(resolveOrCreate).toHaveBeenCalledWith('roster:a');
    expect(createTab).toHaveBeenCalledWith('conv-1', undefined, { activate: true, kind: 'chat' });
    expect(switchToTab).not.toHaveBeenCalled();

    // The DM tab is now open — a second select for the same agent switches to it.
    openTab = { tabId: 'tab-1' };
    await view.selectAgent('roster:a');
    expect(createTab).toHaveBeenCalledTimes(1);
    expect(switchToTab).toHaveBeenCalledWith('tab-1');
  });

  it('records selectedAgentId and projects it to observers synchronously, before the async open', async () => {
    const observer = jest.fn();
    const view = makeView();
    view.teamChatObservers = new Set([observer]);
    view.teamChatThreadStore = { resolveOrCreate: jest.fn().mockResolvedValue('conv-1') };
    view.tabManager = {
      findTabByConversation: () => null,
      createTab: jest.fn().mockResolvedValue({}),
      switchToTab: jest.fn(),
    };

    const pending = view.selectAgent('roster:z');
    // Selection is recorded + projected up-front so the roster highlights and the
    // right-pane empty state clears immediately, not after the conversation resolves.
    expect(view.selectedAgentId).toBe('roster:z');
    expect(observer).toHaveBeenCalledWith({ selectedAgentId: 'roster:z' });
    await pending;
  });
});

describe('TeamChatView.createDmConversation — roster-policy provider (spec §2)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates the DM on the agent OWN provider (from modelSelection), NOT the global default', async () => {
    const createConversation = jest.fn().mockResolvedValue({ id: 'conv-x' });
    // No explicit providerOverride; only a cross-provider modelSelection. A naive
    // `providerOverride ?? default` would land this DM on 'claude' (the default),
    // after which resolveBoundAgent would drop the cursor model as cross-provider.
    const agent = fakeAgent({ modelSelection: { modelId: 'cursor-fast', providerId: 'cursor' } });
    const view = makeView({
      plugin: {
        agentRosterStore: { get: jest.fn().mockResolvedValue(agent) },
        settings: {},
        createConversation,
      },
    });

    const conversation = await view.createDmConversation('roster:a');

    expect(conversation).toEqual({ id: 'conv-x' });
    expect(createConversation).toHaveBeenCalledWith({
      boundAgentId: 'roster:a',
      surface: 'team-chat',
      providerId: 'cursor',
    });
  });

  it('honors an explicit providerOverride over the model selection', async () => {
    const createConversation = jest.fn().mockResolvedValue({ id: 'conv-y' });
    const agent = fakeAgent({
      providerOverride: 'codex',
      modelSelection: { modelId: 'cursor-fast', providerId: 'cursor' },
    });
    const view = makeView({
      plugin: {
        agentRosterStore: { get: jest.fn().mockResolvedValue(agent) },
        settings: {},
        createConversation,
      },
    });

    await view.createDmConversation('roster:a');
    expect(createConversation).toHaveBeenCalledWith(
      expect.objectContaining({ boundAgentId: 'roster:a', surface: 'team-chat', providerId: 'codex' }),
    );
  });

  it('falls back to no explicit provider when the agent is not in the roster', async () => {
    const createConversation = jest.fn().mockResolvedValue({ id: 'conv-z' });
    const view = makeView({
      plugin: {
        agentRosterStore: { get: jest.fn().mockResolvedValue(null) },
        settings: {},
        createConversation,
      },
    });

    await view.createDmConversation('roster:gone');
    expect(createConversation).toHaveBeenCalledWith({ boundAgentId: 'roster:gone', surface: 'team-chat' });
  });
});
