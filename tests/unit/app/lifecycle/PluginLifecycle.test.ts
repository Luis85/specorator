import { PluginLifecycle } from '@/app/lifecycle/PluginLifecycle';
import type { SpecoratorView } from '@/features/chat/SpecoratorView';
import type SpecoratorPlugin from '@/main';
import * as pathUtils from '@/utils/path';

function createView(tabs: unknown[]) {
  const tabManager = {
    disposeAllRuntimes: jest.fn(),
    getPersistedState: jest.fn().mockReturnValue({ openTabs: [] }),
  };
  return {
    getTabManager: jest.fn().mockReturnValue(tabManager),
    __tabManager: tabManager,
  } as unknown as SpecoratorView & { __tabManager: { disposeAllRuntimes: jest.Mock } };
}

function createPlugin(views: SpecoratorView[]): SpecoratorPlugin {
  return {
    getAllViews: jest.fn().mockReturnValue(views),
    persistTabManagerState: jest.fn().mockResolvedValue(undefined),
    app: { vault: { on: jest.fn() } },
  } as unknown as SpecoratorPlugin;
}

describe('PluginLifecycle.shutdownActiveRuntimes', () => {
  it('delegates to disposeAllRuntimes on every view', () => {
    const viewA = createView([]) as any;
    const viewB = createView([]) as any;
    const plugin = createPlugin([viewA, viewB]);

    new PluginLifecycle(plugin).shutdownActiveRuntimes();

    expect(viewA.__tabManager.disposeAllRuntimes).toHaveBeenCalledTimes(1);
    expect(viewB.__tabManager.disposeAllRuntimes).toHaveBeenCalledTimes(1);
  });

  it('skips views without a tab manager', () => {
    const view = { getTabManager: jest.fn().mockReturnValue(null) } as unknown as SpecoratorView;
    const plugin = createPlugin([view]);

    expect(() => new PluginLifecycle(plugin).shutdownActiveRuntimes()).not.toThrow();
  });
});

describe('PluginLifecycle.persistOpenTabStates', () => {
  it('saves state for every view in parallel', async () => {
    const viewA = createView([]);
    const viewB = createView([]);
    const plugin = createPlugin([viewA, viewB]);
    const lifecycle = new PluginLifecycle(plugin);

    await lifecycle.persistOpenTabStates();

    expect(plugin.persistTabManagerState).toHaveBeenCalledTimes(2);
  });
});

describe('PluginLifecycle.installGitWatcher', () => {
  afterEach(() => jest.restoreAllMocks());

  it('no-ops when getVaultPath returns null', () => {
    jest.spyOn(pathUtils, 'getVaultPath').mockReturnValue(null as unknown as string);
    const plugin = {
      gitStatusWatcher: null,
      registerEvent: jest.fn(),
      app: { vault: { on: jest.fn() } },
    } as unknown as SpecoratorPlugin;
    const lifecycle = new PluginLifecycle(plugin);

    lifecycle.installGitWatcher();

    expect(plugin.gitStatusWatcher).toBeNull();
    expect(plugin.registerEvent).not.toHaveBeenCalled();
  });
});
