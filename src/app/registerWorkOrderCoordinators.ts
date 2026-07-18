import { Notice } from 'obsidian';

import { ProviderRegistry } from '@/core/providers/ProviderRegistry';
import { CommitOnAcceptCoordinator } from '@/features/tasks/commit/CommitOnAcceptCoordinator';
import { CommitOnAcceptModal } from '@/features/tasks/commit/CommitOnAcceptModal';
import type { ChatTabExecutionSurface } from '@/features/tasks/execution/ChatTabExecutionSurface';
import { createWorkOrderChainCoordinator } from '@/features/tasks/execution/createWorkOrderChainCoordinator';
import { TaskNoteStore } from '@/features/tasks/storage/TaskNoteStore';
import type SpecoratorPlugin from '@/main';

/**
 * Wires the plugin's two work-order coordinators against a single shared
 * `TaskNoteStore`: `CommitOnAcceptCoordinator` (offers a scoped commit prompt
 * when a work order finishes with dirty git state) and the
 * `WorkOrderChainCoordinator` (auto-spawns a chained successor work order, via
 * `createWorkOrderChainCoordinator`). Lifted out of `onload` so `main.ts` reads
 * as orchestration (mirrors `registerPluginViews.ts`); both coordinators are
 * started here and their disposal is registered via `plugin.register` instead
 * of kept on plugin fields.
 */
export function registerWorkOrderCoordinators(
  plugin: SpecoratorPlugin,
  surface: ChatTabExecutionSurface,
): void {
  const noteStore = new TaskNoteStore();
  const commit = new CommitOnAcceptCoordinator({
    events: plugin.events,
    loadTaskSpec: async (path) => {
      const file = plugin.app.vault.getAbstractFileByPath(path);
      if (!file || !('vault' in file)) {
        throw new Error('Work order file not found');
      }
      const content = await plugin.app.vault.read(file as Parameters<typeof plugin.app.vault.read>[0]);
      return noteStore.parse(path, content).task;
    },
    getGitStatus: async () => {
      await plugin.gitStatusWatcher?.refresh();
      return plugin.gitStatusWatcher?.getLastStatus() ?? { isRepo: false, dirtyCount: 0 };
    },
    isProviderGitEnabled: (providerId) => {
      try {
        const config = ProviderRegistry.getChatUIConfig(providerId);
        return config.isGitActionsEnabled?.(plugin.settings) !== false;
      } catch {
        return false;
      }
    },
    openModal: (opts) => {
      const modal = new CommitOnAcceptModal(plugin.app, opts);
      modal.open();
      return modal.result();
    },
    surface,
    readSettings: () => plugin.settings,
    saveSettings: () => plugin.saveSettings(),
    logger: plugin.logger.scope('tasks.commitOnAccept'),
    showNotice: (message) => { new Notice(message); },
  });
  commit.start();
  plugin.register(() => commit.stop());

  const chain = createWorkOrderChainCoordinator(plugin, noteStore);
  chain.start();
  plugin.register(() => chain.stop());
}
