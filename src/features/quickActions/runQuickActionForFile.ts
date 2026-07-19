import { Notice, type TAbstractFile, TFile, TFolder } from 'obsidian';

import type { ProviderId } from '@/core/providers/types';
import { applyUserAttachedContext, snapshotUserAttachedContext } from '@/features/chat/tabs/blankTabDraft';
import { resolveOverrideTargetTab } from '@/features/chat/tabs/resolveOverrideTargetTab';
import { t } from '@/i18n/i18n';
import type SpecoratorPlugin from '@/main';

import { ensureChatTabManager } from './ensureChatTabManager';
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
 * to it FIRST so the welcome reset does not wipe the chip, then re-applies the
 * files/folders the user had attached in their active chat tab, attaches the
 * right-clicked file or folder as a pill, and fires the action prompt.
 *
 * The carry step matters: a quick action usually resolves to a FRESH tab (the
 * active tab holds a draft, or the picker's provider/model forces a new one),
 * and a fresh tab does not inherit the files/folders the user attached — so
 * without carrying them forward the run goes out with none of the context the
 * user set up. Captured before the switch so the target tab's welcome reset
 * cannot clear it out from under us.
 *
 * `file` may be null — no right-clicked file (e.g. the Library tab's Run
 * button): the extra pill attach is skipped, but any carried context and the
 * prompt still dispatch.
 */
export async function runQuickActionForFile(
  plugin: SpecoratorPlugin,
  file: TAbstractFile | null,
  action: QuickAction,
  override?: QuickActionRunOverride,
): Promise<void> {
  const tabManager = await ensureChatTabManager(plugin);
  if (!tabManager) {
    plugin.logger.scope('quickActions').warn('view/tabManager unavailable, skipping dispatch');
    return;
  }

  // Snapshot the active tab's user-attached context BEFORE resolving/switching:
  // the target may be a fresh tab, and switchToTab's welcome reset wipes pills.
  const carriedContext = snapshotUserAttachedContext(tabManager.getActiveTab());

  const targetTab = await resolveOverrideTargetTab(plugin, tabManager, override);
  if (!targetTab) {
    new Notice(t('quickActions.contextMenu.tabLimitReached'));
    return;
  }

  // Switch BEFORE attaching so the blank-tab welcome reset does not wipe
  // the pills. See openContextMenuQuickAction comment block for full
  // rationale.
  await tabManager.switchToTab(targetTab.id);

  // Re-apply the carried context AFTER the switch (post welcome reset) so the
  // send carries the files/folders the user attached, not just the prompt.
  applyUserAttachedContext(targetTab, carriedContext);

  if (file instanceof TFile) {
    targetTab.ui.fileContextManager?.attachFileAsPill(file.path);
  } else if (file instanceof TFolder) {
    targetTab.ui.fileContextManager?.attachFolderAsPill(file.path);
  }

  await dispatchQuickActionToTab(plugin, targetTab, action);
}
