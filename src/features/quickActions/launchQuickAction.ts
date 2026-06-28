import { type TAbstractFile } from 'obsidian';

import { t } from '@/i18n/i18n';
import type SpecoratorPlugin from '@/main';
import { launchWithModelPicker } from './launchWithModelPicker';

import { quickActionStemFromPath } from './quickActionStem';
import { runQuickActionForFile } from './runQuickActionForFile';
import type { QuickAction } from './types';

/**
 * Single seam invoked by every non-chat quick-action entry point. Delegates the
 * provider/model preset + picker + persist dance to `launchWithModelPicker`,
 * keyed by the quick-action stem (bare key preserved for back-compat), then
 * dispatches via `runQuickActionForFile`.
 */
export async function launchQuickAction(
  plugin: SpecoratorPlugin,
  file: TAbstractFile,
  action: QuickAction,
): Promise<void> {
  const stem = quickActionStemFromPath(action.filePath);
  const rawName = action.name?.trim();
  const name = rawName && rawName.length > 0 ? rawName : t('quickActions.launchModal.untitledFallback');
  launchWithModelPicker(plugin, {
    lastUsedKey: stem,
    title: t('quickActions.launchModal.title', { name }),
    onConfirm: (choice) => void runQuickActionForFile(plugin, file, action, choice),
  });
}
