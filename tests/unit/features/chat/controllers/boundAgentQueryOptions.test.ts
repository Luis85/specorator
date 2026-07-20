import { resolveBoundAgentQueryOptions } from '@/features/chat/controllers/boundAgentQueryOptions';

function createPlugin(overrides: {
  getConversationById?: jest.Mock;
  resolveBoundAgent?: jest.Mock;
} = {}) {
  return {
    logger: { scope: () => ({ debug: jest.fn() }) },
    getConversationById: overrides.getConversationById ?? jest.fn().mockResolvedValue(null),
    resolveBoundAgent: overrides.resolveBoundAgent,
  } as any;
}

describe('resolveBoundAgentQueryOptions', () => {
  it('returns an empty base when there is no conversation id', async () => {
    const options = await resolveBoundAgentQueryOptions(createPlugin(), null, undefined);
    expect(options).toEqual({});
  });

  it('carries the tab model override into the base', async () => {
    const options = await resolveBoundAgentQueryOptions(createPlugin(), null, 'haiku');
    expect(options).toEqual({ model: 'haiku' });
  });

  it('returns the base when the conversation has no bound agent', async () => {
    const plugin = createPlugin({
      getConversationById: jest.fn().mockResolvedValue({ id: 'c1' }),
    });
    const options = await resolveBoundAgentQueryOptions(plugin, 'c1', 'opus');
    expect(options).toEqual({ model: 'opus' });
  });

  it('folds the bound-agent model and prompt when no tab override is set', async () => {
    const plugin = createPlugin({
      getConversationById: jest.fn().mockResolvedValue({ id: 'c1', providerId: 'claude', boundAgentId: 'a1' }),
      resolveBoundAgent: jest.fn().mockResolvedValue({ model: 'opus', prompt: 'be terse', slug: 'terse', description: 'd' }),
    });
    const options = await resolveBoundAgentQueryOptions(plugin, 'c1', null);
    expect(options.model).toBe('opus');
    expect(options.boundAgentModel).toBe('opus');
    expect(options.boundAgentPrompt).toBe('be terse');
    expect(options.boundAgentSlug).toBe('terse');
    // Provider is threaded through so a cross-provider model id can be gated upstream.
    expect(plugin.resolveBoundAgent).toHaveBeenCalledWith('a1', 'claude');
  });

  it('lets the tab override win over the bound-agent model', async () => {
    const plugin = createPlugin({
      getConversationById: jest.fn().mockResolvedValue({ id: 'c1', providerId: 'claude', boundAgentId: 'a1' }),
      resolveBoundAgent: jest.fn().mockResolvedValue({ model: 'opus' }),
    });
    const options = await resolveBoundAgentQueryOptions(plugin, 'c1', 'haiku');
    expect(options.model).toBe('haiku');
    expect(options.boundAgentModel).toBe('opus');
  });

  it('returns the base when resolveBoundAgent yields nothing', async () => {
    const plugin = createPlugin({
      getConversationById: jest.fn().mockResolvedValue({ id: 'c1', boundAgentId: 'a1' }),
      resolveBoundAgent: jest.fn().mockResolvedValue(null),
    });
    const options = await resolveBoundAgentQueryOptions(plugin, 'c1', null);
    expect(options).toEqual({});
  });
});
