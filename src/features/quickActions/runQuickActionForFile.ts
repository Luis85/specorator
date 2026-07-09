import { Notice, type TAbstractFile, TFile, TFolder } from 'obsidian';

import type { ProviderId } from '@/core/providers/types';
import { resolveOverrideTargetTab } from '@/features/chat/tabs/resolveOverrideTargetTab';
import { t } from '@/i18n/i18n';
import type SpecoratorPlugin from '@/main';

import { quickActionStemFromPath } from './quickActionStem';
import type { QuickAction } from './types';

export { quickActionStemFromPath };

/**
 * Per-run provider+model override applied to the target tab. When present, the
 * active blank tab is only reused if its current provider AND effective model
 * both equal the override; otherwise a fresh tab is created with
 * `defaultProviderId` + `pinnedModel` so the runtime applies the chosen model
 * on every turn. `switchToTab` does not carry a model, so reusing a tab pinned
 * to a different model would silently drop the picker's choice.
 */
export interface QuickActionRunOverride {
  providerId: ProviderId;
  model: string;
}

/**
 * Structural shape of the target tab passed to {@link dispatchQuickActionToTab}.
 * Kept narrow so the helper does not couple to the full `TabData` type from
 * the chat slice — callers (`runQuickActionForFile`, `SpecoratorView` header
 * onRun, future entry points) only need access to `inputController`.
 */
export interface QuickActionDispatchTarget {
  controllers: {
    inputController?: {
      sendMessage(options: { content: string; includeComposerDraft?: boolean }): Promise<unknown>;
    } | null;
  };
}

/**
 * Send a quick-action prompt into the given tab and emit `usage.recorded`
 * on resolved success. The single seam every quick-action entry point
 * funnels through: file/folder context menu, WO-card favorites, and the
 * chat-header toolbar. Centralising the send+emit pair prevents new entry
 * points from undercounting the leaderboard.
 *
 * - Skips emit if the tab has no input controller (cannot send).
 * - Skips emit if `sendMessage` rejects (no successful dispatch).
 */
export async function dispatchQuickActionToTab(
  plugin: SpecoratorPlugin,
  tab: QuickActionDispatchTarget,
  action: QuickAction,
): Promise<void> {
  const inputController = tab.controllers.inputController;
  if (!inputController) return;
  // Fold any unsent composer draft into the send: the chat-header entry point
  // targets the active tab, where the user may have typed context they expect
  // the action to receive. Context-menu / favorites entry points resolve
  // draft-free tabs (blankTabHasPendingDraft guard), so this is a no-op there.
  await inputController.sendMessage({ content: action.prompt, includeComposerDraft: true });
  plugin.events.emit('usage.recorded', {
    kind: 'quickAction',
    name: quickActionStemFromPath(action.filePath),
  });
}

/**
 * Shared run flow used by both the quick-actions modal callback and the
 * favorite items injected into the file/folder right-click menu.
 *
 * Ensures the chat view is open, picks (or creates) a target tab, switches
 * to it FIRST so the welcome reset does not wipe the chip, then attaches
 * the right-clicked file or folder as a pill and fires the action prompt.
 *
 * `file` may be null — no file context (e.g. the Library tab's Run button):
 * the pill attach is skipped and the prompt still dispatches.
 */
export async function runQuickActionForFile(
  plugin: SpecoratorPlugin,
  file: TAbstractFile | null,
  action: QuickAction,
  override?: QuickActionRunOverride,
): Promise<void> {
  let view = plugin.getView();
  if (!view) {
    await plugin.activateView();
    view = plugin.getView();
  }
  if (!view) {
    plugin.logger.scope('quickActions').warn('view unavailable, skipping dispatch');
    return;
  }

  const tabManager = view.getTabManager();
  if (!tabManager) {
    plugin.logger.scope('quickActions').warn('tabManager unavailable, skipping dispatch');
    return;
  }

  const targetTab = await resolveOverrideTargetTab(plugin, tabManager, override);
  if (!targetTab) {
    new Notice(t('quickActions.contextMenu.tabLimitReached'));
    return;
  }

  // Switch BEFORE attaching so the blank-tab welcome reset does not wipe
  // the pill. See openContextMenuQuickAction comment block for full
  // rationale.
  await tabManager.switchToTab(targetTab.id);

  if (file instanceof TFile) {
    targetTab.ui.fileContextManager?.attachFileAsPill(file.path);
  } else if (file instanceof TFolder) {
    targetTab.ui.fileContextManager?.attachFolderAsPill(file.path);
  }

  await dispatchQuickActionToTab(plugin, targetTab, action);
}
