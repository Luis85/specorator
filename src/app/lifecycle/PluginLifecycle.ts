import { debounce } from 'obsidian';

import { GitService } from '@/features/chat/services/GitService';
import { GitStatusWatcher } from '@/features/chat/services/GitStatusWatcher';
import { maybeOpenOnboarding } from '@/features/onboarding/maybeOpenOnboarding';
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

  /**
   * Restored views constructed before provider workspace services were ready may
   * have mounted the empty-state placeholder; reprobe so they promote to the full
   * tab UI now that providers exist. One failing view never blocks the rest.
   */
  async refreshRestoredViews(): Promise<void> {
    for (const view of this.plugin.getAllViews()) {
      try {
        await view.refreshProviderAvailability();
      } catch (error) {
        this.plugin.logger.scope('onload').error('view refresh after deferred init failed', error);
      }
    }
  }

  /**
   * Runs the post-`onLayoutReady` startup work, then the first-run Setup open.
   *
   * The open is sequenced with an unconditional continuation, not chained onto
   * success: `completeDeferredOnload` bails out when provider workspace
   * initialization fails and can reject outright when a cache hydration throws,
   * and a vault where that happens is precisely where the user most needs the
   * Setup view (CLI detection already degrades to `unknown` without workspace
   * services). Gating onboarding on unrelated startup success would leave a
   * fresh vault with no first-run surface at all.
   */
  async runDeferredStartup(completeDeferredOnload: () => Promise<void>): Promise<void> {
    try {
      await completeDeferredOnload();
    } catch (error) {
      this.plugin.logger.scope('onload').error('deferred onload failed', error);
    }
    await this.openOnboardingIfFirstRun();
  }

  /**
   * Opens the guided Setup view on a genuine first run. Failure is logged, never
   * propagated: a plugin load must not break because an onboarding leaf would not
   * open.
   */
  async openOnboardingIfFirstRun(): Promise<void> {
    try {
      await maybeOpenOnboarding(this.plugin);
    } catch (error) {
      this.plugin.logger.scope('onload').error('onboarding view open failed', error);
    }
  }

  shutdownActiveRuntimes(): void {
    for (const view of this.plugin.getAllViews()) {
      const tabManager = view.getTabManager();
      if (!tabManager) continue;
      for (const tab of tabManager.getAllTabs()) {
        try {
          void tab.service?.cleanup();
        } catch {
          // best-effort: keep tearing down remaining runtimes
        }
      }
    }
  }

  async persistOpenTabStates(): Promise<void> {
    await Promise.all(
      this.plugin.getAllViews().map((view) => {
        const tabManager = view.getTabManager();
        if (!tabManager) return Promise.resolve();
        return this.plugin.persistTabManagerState(tabManager.getPersistedState());
      }),
    );
  }
}
