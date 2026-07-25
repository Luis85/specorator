import { debounce } from 'obsidian';

import { VIEW_TYPE_SPECORATOR } from '@/core/types';
import { GitService } from '@/features/chat/services/GitService';
import { GitStatusWatcher } from '@/features/chat/services/GitStatusWatcher';
import type SpecoratorPlugin from '@/main';
import { getEnhancedPath } from '@/utils/env';
import { getVaultPath } from '@/utils/path';

export class PluginLifecycle {
  constructor(private readonly plugin: SpecoratorPlugin) {}

  installGitWatcher(): void {
    const vaultPath = getVaultPath(this.plugin.app);
    if (!vaultPath) return;

    this.plugin.gitStatusWatcher = new GitStatusWatcher(
      new GitService(vaultPath, getEnhancedPath()),
    );
    const refreshGit = debounce(
      () => void this.plugin.gitStatusWatcher?.refresh(),
      1500,
      true,
    );
    this.plugin.registerEvent(this.plugin.app.vault.on('modify', () => refreshGit()));
    this.plugin.registerEvent(this.plugin.app.vault.on('create', () => refreshGit()));
    this.plugin.registerEvent(this.plugin.app.vault.on('delete', () => refreshGit()));
    this.plugin.registerEvent(this.plugin.app.vault.on('rename', () => refreshGit()));
  }

  shutdownActiveRuntimes(): void {
    for (const view of this.plugin.getAllViews()) {
      view.getTabManager()?.disposeAllRuntimes();
    }
  }

  async persistOpenTabStates(): Promise<void> {
    await Promise.all(
      this.plugin
        .getAllViews()
        // The global data.tabManagerState slot is the SIDEBAR's cross-restore
        // fallback; Team Chat is leaf-owned (its own getState/setState), so its
        // DM layout must never overwrite the singleton — last-write-wins would
        // otherwise let the two host types clobber each other's persisted tabs.
        .filter((view) => view.leaf.view.getViewType() === VIEW_TYPE_SPECORATOR)
        .map((view) => {
          const tabManager = view.getTabManager();
          if (!tabManager) return Promise.resolve();
          return this.plugin.persistTabManagerState(tabManager.getPersistedState());
        }),
    );
  }
}
