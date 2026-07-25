import { PluginLifecycle } from '@/app/lifecycle/PluginLifecycle';
import type { SpecoratorView } from '@/features/chat/SpecoratorView';
import type SpecoratorPlugin from '@/main';
import * as pathUtils from '@/utils/path';

function createTab(opts: { cleanup?: () => Promise<void> | void } = {}) {
  return {
    service: { cleanup: jest.fn(opts.cleanup ?? (() => undefined)) },
  };
}

function createView(tabs: ReturnType<typeof createTab>[]) {
  const tabManager = {
    getAllTabs: jest.fn().mockReturnValue(tabs),
    getPersistedState: jest.fn().mockReturnValue({ openTabs: [] }),
  };
  return {
    getTabManager: jest.fn().mockReturnValue(tabManager),
  } as unknown as SpecoratorView;
}

function createPlugin(views: SpecoratorView[]): SpecoratorPlugin {
  return {
    getAllViews: jest.fn().mockReturnValue(views),
    persistTabManagerState: jest.fn().mockResolvedValue(undefined),
    app: { vault: { on: jest.fn() } },
  } as unknown as SpecoratorPlugin;
}

describe('PluginLifecycle.shutdownActiveRuntimes', () => {
  it('calls cleanup on every tab across every view', () => {
    const tabsA = [createTab(), createTab()];
    const tabsB = [createTab()];
    const plugin = createPlugin([createView(tabsA), createView(tabsB)]);
    const lifecycle = new PluginLifecycle(plugin);

    lifecycle.shutdownActiveRuntimes();

    for (const tab of [...tabsA, ...tabsB]) {
      expect(tab.service.cleanup).toHaveBeenCalledTimes(1);
    }
  });

  it('swallows cleanup errors and keeps tearing down remaining tabs', () => {
    const throwingTab = createTab({ cleanup: () => { throw new Error('boom'); } });
    const okTab = createTab();
    const plugin = createPlugin([createView([throwingTab, okTab])]);
    const lifecycle = new PluginLifecycle(plugin);

    expect(() => lifecycle.shutdownActiveRuntimes()).not.toThrow();
    expect(okTab.service.cleanup).toHaveBeenCalledTimes(1);
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

describe('PluginLifecycle.refreshRestoredViews', () => {
  function createRefreshPlugin(views: unknown[]): SpecoratorPlugin {
    return {
      getAllViews: jest.fn().mockReturnValue(views),
      logger: { scope: () => ({ error: jest.fn() }) },
    } as unknown as SpecoratorPlugin;
  }

  it('reprobes provider availability on every restored view', async () => {
    const first = { refreshProviderAvailability: jest.fn().mockResolvedValue(undefined) };
    const second = { refreshProviderAvailability: jest.fn().mockResolvedValue(undefined) };

    await new PluginLifecycle(createRefreshPlugin([first, second])).refreshRestoredViews();

    expect(first.refreshProviderAvailability).toHaveBeenCalledTimes(1);
    expect(second.refreshProviderAvailability).toHaveBeenCalledTimes(1);
  });

  it('one failing view never blocks the rest', async () => {
    const failing = { refreshProviderAvailability: jest.fn().mockRejectedValue(new Error('boom')) };
    const healthy = { refreshProviderAvailability: jest.fn().mockResolvedValue(undefined) };

    await expect(
      new PluginLifecycle(createRefreshPlugin([failing, healthy])).refreshRestoredViews(),
    ).resolves.toBeUndefined();
    expect(healthy.refreshProviderAvailability).toHaveBeenCalledTimes(1);
  });
});

describe('PluginLifecycle.runDeferredStartup', () => {
  function createStartupPlugin() {
    return {
      settings: { firstRunDismissed: true },
      app: { workspace: { getLeavesOfType: jest.fn().mockReturnValue([]), getLeaf: jest.fn() } },
      logger: { scope: () => ({ error: jest.fn() }) },
    } as unknown as SpecoratorPlugin;
  }

  it('runs the first-run open after the deferred work', async () => {
    const plugin = createStartupPlugin();
    const lifecycle = new PluginLifecycle(plugin);
    const open = jest.spyOn(lifecycle, 'openOnboardingIfFirstRun').mockResolvedValue(undefined);
    const order: string[] = [];

    await lifecycle.runDeferredStartup(async () => { order.push('deferred'); }, () => false);
    order.push('open');

    expect(open).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['deferred', 'open']);
  });

  it('skips the open when the plugin unloaded mid-startup', async () => {
    // The flow persists its auto-open flag before activating, so opening a leaf
    // on a torn-down plugin would burn the vault's one auto-open.
    const lifecycle = new PluginLifecycle(createStartupPlugin());
    const open = jest.spyOn(lifecycle, 'openOnboardingIfFirstRun').mockResolvedValue(undefined);

    await lifecycle.runDeferredStartup(async () => {}, () => true);

    expect(open).not.toHaveBeenCalled();
  });

  it('still opens Setup when the deferred work rejects', async () => {
    // A vault whose provider init or cache hydration failed is exactly where the
    // setup view is most needed; detection degrades to `unknown` without services.
    const plugin = createStartupPlugin();
    const lifecycle = new PluginLifecycle(plugin);
    const open = jest.spyOn(lifecycle, 'openOnboardingIfFirstRun').mockResolvedValue(undefined);

    await expect(
      lifecycle.runDeferredStartup(
        () => Promise.reject(new Error('provider init failed')),
        () => false,
      ),
    ).resolves.toBeUndefined();

    expect(open).toHaveBeenCalledTimes(1);
  });
});

describe('PluginLifecycle.openOnboardingIfFirstRun', () => {
  it('opens the Setup view on a first run', async () => {
    const plugin = {
      settings: { firstRunDismissed: false },
      saveSettings: jest.fn().mockResolvedValue(undefined),
      app: { workspace: { getLeavesOfType: jest.fn().mockReturnValue([]), getLeaf: jest.fn(), revealLeaf: jest.fn() } },
      logger: { scope: () => ({ error: jest.fn() }) },
    } as unknown as SpecoratorPlugin;
    const leaf = { setViewState: jest.fn().mockResolvedValue(undefined), loadIfDeferred: jest.fn().mockResolvedValue(undefined) };
    (plugin.app.workspace.getLeaf as jest.Mock).mockReturnValue(leaf);

    await new PluginLifecycle(plugin).openOnboardingIfFirstRun();

    expect(leaf.setViewState).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'specorator-onboarding' }),
    );
  });

  it('stays closed once the flow was completed or dismissed', async () => {
    const plugin = {
      settings: { firstRunDismissed: true },
      app: { workspace: { getLeavesOfType: jest.fn().mockReturnValue([]), getLeaf: jest.fn() } },
      logger: { scope: () => ({ error: jest.fn() }) },
    } as unknown as SpecoratorPlugin;

    await new PluginLifecycle(plugin).openOnboardingIfFirstRun();

    expect(plugin.app.workspace.getLeaf).not.toHaveBeenCalled();
  });

  it('logs rather than propagating an activation failure — a load must not break', async () => {
    const error = jest.fn();
    const plugin = {
      settings: { firstRunDismissed: false },
      saveSettings: jest.fn().mockResolvedValue(undefined),
      app: {
        workspace: {
          getLeavesOfType: jest.fn().mockReturnValue([]),
          getLeaf: jest.fn(() => { throw new Error('no workspace'); }),
        },
      },
      logger: { scope: () => ({ error }) },
    } as unknown as SpecoratorPlugin;

    await expect(new PluginLifecycle(plugin).openOnboardingIfFirstRun()).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
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
