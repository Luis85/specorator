import { PluginLifecycle } from '@/app/lifecycle/PluginLifecycle';
import { VIEW_TYPE_SPECORATOR } from '@/core/types';
import type { SpecoratorView } from '@/features/chat/SpecoratorView';
import { VIEW_TYPE_TEAM_CHAT } from '@/features/teamChat/viewType';
import type SpecoratorPlugin from '@/main';
import * as pathUtils from '@/utils/path';

function createView(
  viewType: string,
  persistedState: unknown = { openTabs: [] },
) {
  const tabManager = {
    disposeAllRuntimes: jest.fn(),
    getPersistedState: jest.fn().mockReturnValue(persistedState),
  };
  const view = {
    getTabManager: jest.fn().mockReturnValue(tabManager),
    getViewType: () => viewType,
    __tabManager: tabManager,
  };
  // getAllViews() hands back view objects; a view's own leaf points back at it
  // (view.leaf.view === view), so PluginLifecycle reads the host type through
  // `leaf.view.getViewType()`.
  return Object.assign(view, { leaf: { view } }) as unknown as SpecoratorView & {
    __tabManager: { disposeAllRuntimes: jest.Mock };
  };
}

function createPlugin(views: SpecoratorView[]): SpecoratorPlugin {
  return {
    getAllViews: jest.fn().mockReturnValue(views),
    persistTabManagerState: jest.fn().mockResolvedValue(undefined),
    app: { vault: { on: jest.fn() } },
  } as unknown as SpecoratorPlugin;
}

describe('PluginLifecycle.shutdownActiveRuntimes', () => {
  it('delegates to disposeAllRuntimes on every host, including a Team Chat leaf', () => {
    const sidebar = createView(VIEW_TYPE_SPECORATOR);
    const teamChat = createView(VIEW_TYPE_TEAM_CHAT);
    const plugin = createPlugin([sidebar, teamChat]);

    new PluginLifecycle(plugin).shutdownActiveRuntimes();

    // Runtime shutdown spans BOTH chat-engine hosts now that getAllViews()
    // enumerates them (T4) — a Team Chat DM runtime must be disposed like the
    // sidebar's. Tab-state persistence isolation (Team Chat deliberately
    // excluded from the global slot) is a separate concern handled in T5.
    expect(sidebar.__tabManager.disposeAllRuntimes).toHaveBeenCalledTimes(1);
    expect(teamChat.__tabManager.disposeAllRuntimes).toHaveBeenCalledTimes(1);
  });

  it('skips views without a tab manager', () => {
    const view = { getTabManager: jest.fn().mockReturnValue(null) } as unknown as SpecoratorView;
    const plugin = createPlugin([view]);

    expect(() => new PluginLifecycle(plugin).shutdownActiveRuntimes()).not.toThrow();
  });
});

describe('PluginLifecycle.persistOpenTabStates', () => {
  it('saves state for every sidebar view in parallel', async () => {
    // Two sidebar leaves each still write the global slot (last-write-wins
    // across sidebars is pre-existing and out of scope here).
    const viewA = createView(VIEW_TYPE_SPECORATOR);
    const viewB = createView(VIEW_TYPE_SPECORATOR);
    const plugin = createPlugin([viewA, viewB]);
    const lifecycle = new PluginLifecycle(plugin);

    await lifecycle.persistOpenTabStates();

    expect(plugin.persistTabManagerState).toHaveBeenCalledTimes(2);
  });

  it('writes only the sidebar host state to the global slot, never a Team Chat leaf', async () => {
    // The global data.tabManagerState slot is the SIDEBAR's cross-restore
    // fallback; Team Chat is leaf-owned (its own getState/setState), so its DM
    // layout must never contaminate the singleton via last-write-wins.
    const sidebarState = { openTabs: ['sidebar'] };
    const teamChatState = { openTabs: ['team-chat'] };
    const sidebar = createView(VIEW_TYPE_SPECORATOR, sidebarState);
    const teamChat = createView(VIEW_TYPE_TEAM_CHAT, teamChatState);
    const plugin = createPlugin([sidebar, teamChat]);

    await new PluginLifecycle(plugin).persistOpenTabStates();

    expect(plugin.persistTabManagerState).toHaveBeenCalledTimes(1);
    expect(plugin.persistTabManagerState).toHaveBeenCalledWith(sidebarState);
    expect(plugin.persistTabManagerState).not.toHaveBeenCalledWith(teamChatState);
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
