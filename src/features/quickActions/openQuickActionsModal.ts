import type { TAbstractFile } from 'obsidian';

import type { EventBus } from '@/core/events/EventBus';
import type { UsageEventMap } from '@/core/usage/events';
import { isCloneableSkillPath } from '@/features/skills/skillCloning';
import type { SkillLibraryRow } from '@/features/skills/skillLibraryRows';
import type SpecoratorPlugin from '@/main';
import { openSpecoratorProviderSettings } from '@/utils/obsidianPrivateApi';

import { createProviderCommandAggregator } from './commands/createProviderCommandAggregator';
import { runProviderCommand } from './commands/runProviderCommand';
import { QuickActionStorage } from './QuickActionStorage';
import { buildProviderRecords } from './skills/buildProviderRecords';
import { runVaultSkill } from './skills/runVaultSkill';
import { VaultSkillAggregator } from './skills/VaultSkillAggregator';
import type { QuickAction } from './types';
import { QuickActionsModal } from './ui/QuickActionsModal';

/**
 * Options for `openQuickActionsModal`.
 *
 * - `onRun`: how to dispatch the picked quick-action prompt. Each caller
 *   decides whether to route through `runQuickAction` (creates/reuses a tab,
 *   attaches a file pill), or to send into a known target tab.
 * - `file`: optional vault file/folder forwarded to `runVaultSkill` when the
 *   user picks a skill on the Skills tab. `null`/undefined means no pill.
 * - `onFavoritesChanged`: invoked after a favorite toggle inside the modal so
 *   the plugin's `QuickActionFavoritesCache` can re-emit the workspace menu.
 *   Defaults to refreshing the shared cache; every callsite wants the same
 *   wiring so the default keeps callers from drifting.
 */
export interface OpenQuickActionsModalOptions {
  onRun: (action: QuickAction) => void;
  file?: TAbstractFile | null;
  onFavoritesChanged?: () => void;
}

/**
 * Single construction site for the Quick Actions modal. Builds the shared
 * `QuickActionStorage`, `VaultSkillAggregator` + `ProviderCommandAggregator`
 * (wired to the plugin logger), and the Skills/Commands tab routing, so every
 * modal entry point (context menu, header toolbar, per-tab toolbar) gets
 * identical wiring — no fourth-site drift.
 */
export function openQuickActionsModal(
  plugin: SpecoratorPlugin,
  options: OpenQuickActionsModalOptions,
): void {
  const storage = new QuickActionStorage(
    plugin.storage.getAdapter(),
    () => plugin.settings.quickActionsFolder ?? 'Quick Actions',
  );
  // Fallback path: if the deferred onload hasn't run yet (modal opened from
  // the file-menu before workspace layout ready), build a one-shot aggregator
  // without disk cache or EventBus wiring. This is rare in practice.
  const aggregator = plugin.vaultSkillAggregator ?? new VaultSkillAggregator(
    () => buildProviderRecords(plugin),
    { logger: plugin.logger },
  );
  const commands = plugin.providerCommandAggregator
    ?? createProviderCommandAggregator(plugin, { subscribe: false });
  const file = options.file ?? null;

  new QuickActionsModal(plugin.app, {
    storage,
    aggregator,
    commands,
    onRun: options.onRun,
    onRunSkill: (entry) => {
      void runVaultSkill(plugin, entry, file);
    },
    onRunCommand: (entry) => {
      void runProviderCommand(plugin, entry, file);
    },
    onEditSkill: (entry) => {
      // Cursor authoring is Cursor-owned: there is no in-settings skill manager,
      // so its editable project skills open the Library's in-place editor rather
      // than a settings tab with nothing to edit. (Globals never reach here — the
      // edit button only shows for vault-cloneable paths.) Claude/Codex still jump
      // to their settings skill managers.
      if (entry.providerId === 'cursor' && isCloneableSkillPath(entry.sourceFilePath)) {
        const row: SkillLibraryRow = {
          id: entry.id,
          name: entry.name,
          description: entry.description,
          providerId: entry.providerId,
          providerDisplayName: entry.providerDisplayName,
          sourceFilePath: entry.sourceFilePath,
          editable: true,
          tags: [],
        };
        // Lazy import: a static import would pull the obsidian `Modal` base
        // (SkillEditorModal → LibraryEditorModal extends Modal) into every
        // consumer of this module at load time, breaking unit tests that mock
        // obsidian without `Modal`. Deferred to click time it stays out of the
        // module graph. esbuild inlines it into the single cjs bundle.
        void import('@/features/skills/view/SkillEditorModal').then(({ SkillEditorModal }) => {
          new SkillEditorModal(plugin.app, plugin, row, () => {
            plugin.vaultSkillAggregator?.invalidate(entry.providerId);
          }).open();
        });
        return;
      }
      openSpecoratorProviderSettings(
        plugin.app,
        plugin.manifest.id,
        entry.providerId,
      );
    },
    onFavoritesChanged:
      options.onFavoritesChanged ?? (() => plugin.quickActionFavoritesCache?.refresh()),
    usageTracker: plugin.usageTracker,
    // SpecoratorEventMap is a superset of UsageEventMap; cast needed because
    // EventBus<M> is invariant on M.
    events: plugin.events as unknown as EventBus<UsageEventMap>,
  }).open();
}
