import { createMockEl } from '@test/helpers/mockElement';

import type { AppAgentManager, AppPluginManager } from '@/core/providers/types';
import type { PluginInfo } from '@/core/types';
import { PluginSettingsManager } from '@/providers/claude/ui/PluginSettingsManager';

function makePlugin(overrides: Partial<PluginInfo> = {}): PluginInfo {
  return {
    id: 'formatter@marketplace',
    name: 'formatter',
    enabled: true,
    scope: 'user',
    installPath: '/plugins/formatter',
    ...overrides,
  };
}

function makeDeps(plugin: PluginInfo) {
  const plugins = [plugin];
  const pluginManager = {
    getPlugins: jest.fn(() => plugins),
    togglePlugin: jest.fn(async (id: string) => {
      const p = plugins.find((x) => x.id === id);
      if (p) p.enabled = !p.enabled;
    }),
    loadPlugins: jest.fn(async () => {}),
  } as unknown as AppPluginManager;
  const agentManager = { loadAgents: jest.fn(async () => {}) } as unknown as Pick<AppAgentManager, 'loadAgents'>;
  const restartTabs = jest.fn(async () => {});
  const onPluginsChanged = jest.fn();
  return { pluginManager, agentManager, restartTabs, onPluginsChanged };
}

describe('PluginSettingsManager', () => {
  it('fires onPluginsChanged after toggling a plugin', async () => {
    const deps = makeDeps(makePlugin());
    const container = createMockEl();
    new PluginSettingsManager(container, deps);

    const toggleBtn = container.querySelector('.specorator-plugin-action-btn');
    expect(toggleBtn).not.toBeNull();

    toggleBtn!.click();
    // The click handler runs `void this.togglePlugin(...)`; flush microtasks.
    await Promise.resolve();
    await Promise.resolve();

    expect(deps.pluginManager.togglePlugin).toHaveBeenCalledWith('formatter@marketplace');
    expect(deps.onPluginsChanged).toHaveBeenCalledTimes(1);
  });

  it('fires onPluginsChanged after refreshing the plugin list', async () => {
    const deps = makeDeps(makePlugin());
    const container = createMockEl();
    new PluginSettingsManager(container, deps);

    const refreshBtn = container.querySelector('.specorator-settings-action-btn');
    expect(refreshBtn).not.toBeNull();

    refreshBtn!.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(deps.pluginManager.loadPlugins).toHaveBeenCalledTimes(1);
    expect(deps.onPluginsChanged).toHaveBeenCalledTimes(1);
  });

  it('surfaces a local-override notice and skips refresh when the toggle has no effect', async () => {
    // Simulate `.claude/settings.local.json` overriding the project toggle: the
    // manager's togglePlugin writes project settings but the effective `enabled`
    // is unchanged (local wins).
    const plugin = makePlugin({ enabled: false });
    const plugins = [plugin];
    const pluginManager = {
      getPlugins: jest.fn(() => plugins),
      togglePlugin: jest.fn(async () => { /* local override → enabled stays false */ }),
      loadPlugins: jest.fn(async () => {}),
    } as unknown as AppPluginManager;
    const agentManager = { loadAgents: jest.fn(async () => {}) } as unknown as Pick<AppAgentManager, 'loadAgents'>;
    const restartTabs = jest.fn(async () => {});
    const onPluginsChanged = jest.fn();

    const container = createMockEl();
    new PluginSettingsManager(container, { pluginManager, agentManager, restartTabs, onPluginsChanged });

    container.querySelector('.specorator-plugin-action-btn')!.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(pluginManager.togglePlugin).toHaveBeenCalled();
    // No effective change → no cache refresh, no agent reload, no tab restart.
    expect(onPluginsChanged).not.toHaveBeenCalled();
    expect(agentManager.loadAgents).not.toHaveBeenCalled();
    expect(restartTabs).not.toHaveBeenCalled();
  });

  it('does not throw when onPluginsChanged is omitted', async () => {
    const deps = makeDeps(makePlugin());
    const container = createMockEl();
    new PluginSettingsManager(container, {
      pluginManager: deps.pluginManager,
      agentManager: deps.agentManager,
      restartTabs: deps.restartTabs,
    });

    const toggleBtn = container.querySelector('.specorator-plugin-action-btn');
    toggleBtn!.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(deps.pluginManager.togglePlugin).toHaveBeenCalled();
  });
});
