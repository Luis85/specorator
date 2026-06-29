import '@/providers';

import { RosterAgentService, type RosterAgentServiceDeps } from '@/app/agents/RosterAgentService';
import type { SpecoratorSettings } from '@/core/types';
import type { AgentRosterStore } from '@/features/agents/roster/AgentRosterStore';
import type { RosterAgent } from '@/features/agents/roster/rosterTypes';
import type { VaultSkillAggregator } from '@/features/quickActions/skills/VaultSkillAggregator';

function makeAgent(overrides: Partial<RosterAgent> = {}): RosterAgent {
  return {
    id: 'roster:atlas',
    name: 'Atlas',
    description: 'A worker',
    prompt: 'Be helpful.',
    disallowedTools: [],
    skills: [],
    roles: ['worker'],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function makeService(overrides: {
  agent?: RosterAgent | null;
  agents?: RosterAgent[];
  catalog?: Array<{ name: string; description: string }>;
  settings?: Partial<SpecoratorSettings>;
} = {}) {
  const get = jest.fn(async () => overrides.agent ?? null);
  const list = jest.fn(async () => overrides.agents ?? []);
  const rosterStore = { get, list } as unknown as AgentRosterStore;
  const aggregator = {
    listAll: jest.fn(async () => overrides.catalog ?? []),
  } as unknown as VaultSkillAggregator;
  const deps: RosterAgentServiceDeps = {
    rosterStore,
    vaultFileAdapter: {} as RosterAgentServiceDeps['vaultFileAdapter'],
    logger: { scope: () => ({ warn: jest.fn() }) } as unknown as RosterAgentServiceDeps['logger'],
    getSettings: () => (overrides.settings ?? {}) as SpecoratorSettings,
    getSkillAggregator: () => aggregator,
  };
  return { service: new RosterAgentService(deps), get, list };
}

describe('RosterAgentService', () => {
  describe('resolveBoundAgent', () => {
    it('returns null when the id is not a known roster agent', async () => {
      const { service, get } = makeService({ agent: null });
      await expect(service.resolveBoundAgent('roster:missing')).resolves.toBeNull();
      expect(get).toHaveBeenCalledWith('roster:missing');
    });

    it('bakes the granted skills into the persona prompt', async () => {
      const { service } = makeService({
        agent: makeAgent({ skills: ['analyze'] }),
        catalog: [{ name: 'analyze', description: 'Static analysis' }],
      });
      const projection = await service.resolveBoundAgent('roster:atlas');
      expect(projection).not.toBeNull();
      expect(projection?.prompt).toContain('Atlas');
      expect(projection?.prompt).toContain('analyze');
    });

    it('drops a cross-provider model id when the conversation provider differs', async () => {
      const { service } = makeService({
        agent: makeAgent({ modelSelection: { modelId: 'gpt-5.5', providerId: 'codex' } }),
      });
      const projection = await service.resolveBoundAgent('roster:atlas', 'claude');
      expect(projection?.model).toBeUndefined();
    });

    it('keeps the agent model id when no conversation provider is given', async () => {
      const { service } = makeService({
        agent: makeAgent({ modelSelection: { modelId: 'opus', providerId: 'claude' } }),
      });
      const projection = await service.resolveBoundAgent('roster:atlas');
      expect(projection?.model).toBe('opus');
    });
  });

  describe('resolveAgentRunTarget', () => {
    it('returns null when the id is not a known roster agent', async () => {
      const { service } = makeService({ agent: null });
      await expect(service.resolveAgentRunTarget('roster:missing')).resolves.toBeNull();
    });

    it('resolves a provider and model for a known agent', async () => {
      const { service } = makeService({ agent: makeAgent() });
      const target = await service.resolveAgentRunTarget('roster:atlas');
      expect(target).not.toBeNull();
      expect(typeof target?.providerId).toBe('string');
      expect(typeof target?.model).toBe('string');
    });
  });
});
