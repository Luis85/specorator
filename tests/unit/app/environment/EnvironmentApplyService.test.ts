import { EnvironmentApplyService } from '@/app/environment/EnvironmentApplyService';
import * as providerEnv from '@/core/providers/providerEnvironment';
import { ProviderRegistry } from '@/core/providers/ProviderRegistry';
import { ProviderSettingsCoordinator } from '@/core/providers/ProviderSettingsCoordinator';
import type { Conversation } from '@/core/types';
import type SpecoratorPlugin from '@/main';

function createPlugin(overrides: Partial<{
  settings: Record<string, unknown>;
  reconcileResult: { changed: boolean; invalidatedConversations: Conversation[] };
}> = {}): SpecoratorPlugin {
  const tabManager = {
    resyncTabsForProviders: jest.fn().mockResolvedValue(0),
  };
  const view = {
    getTabManager: jest.fn().mockReturnValue(tabManager),
    invalidateProviderCommandCaches: jest.fn(),
    refreshModelSelector: jest.fn(),
  };
  return {
    settings: overrides.settings ?? {},
    getView: jest.fn().mockReturnValue(view),
    getAllViews: jest.fn().mockReturnValue([view]),
    saveSettings: jest.fn().mockResolvedValue(undefined),
    storage: {
      sessions: {
        saveMetadata: jest.fn().mockResolvedValue(undefined),
        toSessionMetadata: jest.fn((c: Conversation) => c),
      },
    },
    conversationStore: { getConversations: () => [] },
    getConversationSync: jest.fn().mockReturnValue(null),
    secretStore: {
      set: jest.fn(),
      get: jest.fn().mockReturnValue(null),
      has: jest.fn().mockReturnValue(false),
      list: jest.fn().mockReturnValue([]),
    },
    getResolvedEnvironmentVariables: jest.fn().mockReturnValue({}),
  } as unknown as SpecoratorPlugin;
}

describe('EnvironmentApplyService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('short-circuits when no scope value changed', async () => {
    jest.spyOn(providerEnv, 'getEnvironmentVariablesForScope').mockReturnValue('X=1');
    const plugin = createPlugin();
    const service = new EnvironmentApplyService(plugin);

    await service.applyBatch([{ scope: 'shared', envText: 'X=1' }]);

    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
  });

  it('expands shared scope to every registered provider', () => {
    jest.spyOn(ProviderRegistry, 'getRegisteredProviderIds').mockReturnValue(['claude', 'codex']);
    const plugin = createPlugin();
    const service = new EnvironmentApplyService(plugin);

    const ids = service.affectedProvidersForTests(['shared']);

    expect(ids.sort()).toEqual(['claude', 'codex']);
  });

  it('narrows provider:<id> scope to that one provider when registered', () => {
    jest.spyOn(ProviderRegistry, 'getRegisteredProviderIds').mockReturnValue(['claude', 'codex']);
    const plugin = createPlugin();
    const service = new EnvironmentApplyService(plugin);

    const ids = service.affectedProvidersForTests(['provider:codex']);
    expect(ids).toEqual(['codex']);
  });

  it('delegates resync to each view tab manager with the affected providers and changed flag', async () => {
    jest.spyOn(providerEnv, 'getEnvironmentVariablesForScope').mockReturnValue('OLD');
    jest.spyOn(providerEnv, 'setEnvironmentVariablesForScope').mockImplementation(() => undefined);
    jest.spyOn(ProviderRegistry, 'getRegisteredProviderIds').mockReturnValue(['claude']);
    jest.spyOn(ProviderSettingsCoordinator, 'handleEnvironmentChange' as any).mockImplementation(() => undefined);
    jest.spyOn(ProviderSettingsCoordinator, 'reconcileProviders' as any).mockReturnValue({
      changed: true,
      invalidatedConversations: [],
    });

    const resync1 = jest.fn().mockResolvedValue(0);
    const resync2 = jest.fn().mockResolvedValue(0);
    const view1 = { getTabManager: () => ({ resyncTabsForProviders: resync1 }), invalidateProviderCommandCaches: jest.fn(), refreshModelSelector: jest.fn() };
    const view2 = { getTabManager: () => ({ resyncTabsForProviders: resync2 }), invalidateProviderCommandCaches: jest.fn(), refreshModelSelector: jest.fn() };
    const plugin = { ...createPlugin(), getAllViews: jest.fn().mockReturnValue([view1, view2]) } as unknown as SpecoratorPlugin;

    await new EnvironmentApplyService(plugin).apply('shared', 'NEW');

    // The single-snapshot cancel-then-restart ordering lives inside
    // resyncTabsForProviders (pinned by the TabManager suite); here we only
    // pin that the shell delegates to every view's manager with the right args.
    expect(resync1).toHaveBeenCalledWith(['claude'], true);
    expect(resync2).toHaveBeenCalledWith(['claude'], true);
  });
});
