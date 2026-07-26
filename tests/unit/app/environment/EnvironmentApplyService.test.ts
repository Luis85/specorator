import { EnvironmentApplyService } from '@/app/environment/EnvironmentApplyService';
import * as providerEnv from '@/core/providers/providerEnvironment';
import { ProviderRegistry } from '@/core/providers/ProviderRegistry';
import { ProviderSettingsCoordinator } from '@/core/providers/ProviderSettingsCoordinator';
import type { Conversation } from '@/core/types';
import { VIEW_TYPE_SPECORATOR } from '@/core/types';
import { VIEW_TYPE_TEAM_CHAT } from '@/features/teamChat/viewType';
import type SpecoratorPlugin from '@/main';

function createPlugin(overrides: Partial<{
  settings: Record<string, unknown>;
  reconcileResult: { changed: boolean; invalidatedConversations: Conversation[] };
}> = {}): SpecoratorPlugin {
  const tabManager = {
    cancelStreamingTabsForProviders: jest.fn().mockReturnValue([]),
    restartRuntimeTabs: jest.fn().mockResolvedValue(0),
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

  it('delegates cancel + restart to each view tab manager with the affected providers, frozen ids, and changed flag', async () => {
    jest.spyOn(providerEnv, 'getEnvironmentVariablesForScope').mockReturnValue('OLD');
    jest.spyOn(providerEnv, 'setEnvironmentVariablesForScope').mockImplementation(() => undefined);
    jest.spyOn(ProviderRegistry, 'getRegisteredProviderIds').mockReturnValue(['claude']);
    jest.spyOn(ProviderSettingsCoordinator, 'handleEnvironmentChange' as any).mockImplementation(() => undefined);
    jest.spyOn(ProviderSettingsCoordinator, 'reconcileProviders' as any).mockReturnValue({
      changed: true,
      invalidatedConversations: [],
    });

    const cancel1 = jest.fn().mockReturnValue(['t1']);
    const restart1 = jest.fn().mockResolvedValue(0);
    const cancel2 = jest.fn().mockReturnValue(['t2']);
    const restart2 = jest.fn().mockResolvedValue(0);
    const view1 = { getTabManager: () => ({ cancelStreamingTabsForProviders: cancel1, restartRuntimeTabs: restart1 }), invalidateProviderCommandCaches: jest.fn(), refreshModelSelector: jest.fn() };
    const view2 = { getTabManager: () => ({ cancelStreamingTabsForProviders: cancel2, restartRuntimeTabs: restart2 }), invalidateProviderCommandCaches: jest.fn(), refreshModelSelector: jest.fn() };
    const plugin = { ...createPlugin(), getAllViews: jest.fn().mockReturnValue([view1, view2]) } as unknown as SpecoratorPlugin;

    await new EnvironmentApplyService(plugin).apply('shared', 'NEW');

    // Each manager is cancelled with the affected providers, then restarted with
    // ITS OWN frozen id set + the changed flag. The global cancel-before-restart
    // ordering across views is pinned by the round-14 test below.
    expect(cancel1).toHaveBeenCalledWith(['claude']);
    expect(cancel2).toHaveBeenCalledWith(['claude']);
    expect(restart1).toHaveBeenCalledWith(['t1'], true);
    expect(restart2).toHaveBeenCalledWith(['t2'], true);
  });

  it('fans an env change to a Team Chat host alongside the sidebar (no sidebar regression)', async () => {
    jest.spyOn(providerEnv, 'getEnvironmentVariablesForScope').mockReturnValue('OLD');
    jest.spyOn(providerEnv, 'setEnvironmentVariablesForScope').mockImplementation(() => undefined);
    jest.spyOn(ProviderRegistry, 'getRegisteredProviderIds').mockReturnValue(['claude']);
    jest.spyOn(ProviderSettingsCoordinator, 'handleEnvironmentChange' as any).mockImplementation(() => undefined);
    jest.spyOn(ProviderSettingsCoordinator, 'reconcileProviders' as any).mockReturnValue({
      changed: true,
      invalidatedConversations: [],
    });

    const sidebarCancel = jest.fn().mockReturnValue(['s1']);
    const sidebarRestart = jest.fn().mockResolvedValue(0);
    const teamCancel = jest.fn().mockReturnValue(['tc1']);
    const teamRestart = jest.fn().mockResolvedValue(0);
    const sidebarView = {
      getViewType: () => VIEW_TYPE_SPECORATOR,
      getTabManager: () => ({ cancelStreamingTabsForProviders: sidebarCancel, restartRuntimeTabs: sidebarRestart }),
      invalidateProviderCommandCaches: jest.fn(),
      refreshModelSelector: jest.fn(),
    };
    const teamChatView = {
      getViewType: () => VIEW_TYPE_TEAM_CHAT,
      getTabManager: () => ({ cancelStreamingTabsForProviders: teamCancel, restartRuntimeTabs: teamRestart }),
      invalidateProviderCommandCaches: jest.fn(),
      refreshModelSelector: jest.fn(),
    };
    const plugin = {
      ...createPlugin(),
      getAllViews: jest.fn().mockReturnValue([sidebarView, teamChatView]),
    } as unknown as SpecoratorPlugin;

    await new EnvironmentApplyService(plugin).apply('shared', 'NEW');

    // Now that getAllViews() enumerates Team Chat hosts (T4), an env change must
    // restart the Team Chat DM runtime and refresh its provider caches — exactly
    // like the sidebar's, with no regression to the sidebar path.
    expect(teamCancel).toHaveBeenCalledWith(['claude']);
    expect(teamRestart).toHaveBeenCalledWith(['tc1'], true);
    expect(teamChatView.invalidateProviderCommandCaches).toHaveBeenCalledWith(['claude']);
    expect(sidebarCancel).toHaveBeenCalledWith(['claude']);
    expect(sidebarRestart).toHaveBeenCalledWith(['s1'], true);
    expect(sidebarView.invalidateProviderCommandCaches).toHaveBeenCalledWith(['claude']);
  });

  it('cancels every view before restarting any (global two-phase, env-apply ordering)', async () => {
    jest.spyOn(providerEnv, 'getEnvironmentVariablesForScope').mockReturnValue('OLD');
    jest.spyOn(providerEnv, 'setEnvironmentVariablesForScope').mockImplementation(() => undefined);
    jest.spyOn(ProviderRegistry, 'getRegisteredProviderIds').mockReturnValue(['claude']);
    jest.spyOn(ProviderSettingsCoordinator, 'handleEnvironmentChange' as any).mockImplementation(() => undefined);
    jest.spyOn(ProviderSettingsCoordinator, 'reconcileProviders' as any).mockReturnValue({ changed: false, invalidatedConversations: [] });

    const order: string[] = [];
    const managerFor = (name: string) => ({
      cancelStreamingTabsForProviders: jest.fn(() => { order.push(`cancel:${name}`); return [name]; }),
      restartRuntimeTabs: jest.fn(() => { order.push(`restart:${name}`); return Promise.resolve(0); }),
    });
    const view1 = { getTabManager: () => managerFor('v1'), invalidateProviderCommandCaches: jest.fn(), refreshModelSelector: jest.fn() };
    const view2 = { getTabManager: () => managerFor('v2'), invalidateProviderCommandCaches: jest.fn(), refreshModelSelector: jest.fn() };
    const plugin = { ...createPlugin(), getAllViews: jest.fn().mockReturnValue([view1, view2]) } as unknown as SpecoratorPlugin;

    await new EnvironmentApplyService(plugin).apply('shared', 'NEW');

    expect(order).toEqual(['cancel:v1', 'cancel:v2', 'restart:v1', 'restart:v2']);
  });
});
