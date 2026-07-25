// Isolate the roster-policy assertion from the full provider registration: the
// real resolveAgentProvider runs (so the override→model-provider→fallback logic
// is under test), only the enabled-set + default-provider are stubbed. Relocated
// from TeamChatView.selectAgent.test when the DM-creation moved to plugin scope
// (Round-20 Fix A).
jest.mock('@/core/providers/ProviderRegistry', () => ({
  ProviderRegistry: {
    isEnabled: jest.fn(() => true),
    resolveSettingsProviderId: jest.fn(() => 'claude'),
  },
}));

import { createTeamChatDmConversation } from '@/features/teamChat/createTeamChatDmConversation';

function fakeAgent(overrides: Record<string, unknown>): any {
  return {
    id: 'roster:a', name: 'A', description: '', prompt: '',
    disallowedTools: [], skills: [], roles: ['worker'],
    createdAt: 1, updatedAt: 2, ...overrides,
  };
}

function makePlugin(agent: unknown, createConversation: jest.Mock): any {
  return {
    agentRosterStore: { get: jest.fn().mockResolvedValue(agent) },
    settings: {},
    createConversation,
  };
}

describe('createTeamChatDmConversation — roster-policy provider (spec §2)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates the DM on the agent OWN provider (from modelSelection), NOT the global default', async () => {
    const createConversation = jest.fn().mockResolvedValue({ id: 'conv-x' });
    // No explicit providerOverride; only a cross-provider modelSelection. A naive
    // `providerOverride ?? default` would land this DM on 'claude' (the default),
    // after which resolveBoundAgent would drop the cursor model as cross-provider.
    const agent = fakeAgent({ modelSelection: { modelId: 'cursor-fast', providerId: 'cursor' } });
    const plugin = makePlugin(agent, createConversation);

    const conversation = await createTeamChatDmConversation(plugin, 'roster:a');

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
    const plugin = makePlugin(agent, createConversation);

    await createTeamChatDmConversation(plugin, 'roster:a');
    expect(createConversation).toHaveBeenCalledWith(
      expect.objectContaining({ boundAgentId: 'roster:a', surface: 'team-chat', providerId: 'codex' }),
    );
  });

  it('falls back to no explicit provider when the agent is not in the roster', async () => {
    const createConversation = jest.fn().mockResolvedValue({ id: 'conv-z' });
    const plugin = makePlugin(null, createConversation);

    await createTeamChatDmConversation(plugin, 'roster:gone');
    expect(createConversation).toHaveBeenCalledWith({ boundAgentId: 'roster:gone', surface: 'team-chat' });
  });
});
