import { Notice, type TAbstractFile, TFile, TFolder } from 'obsidian';

import type { ProviderId } from '@/core/providers/types';
import {
  applyUserAttachedContext,
  blankTabHasPendingDraft,
  snapshotUserAttachedContext,
} from '@/features/chat/tabs/blankTabDraft';
import { getTabProviderId } from '@/features/chat/tabs/providerResolution';
import type { TabManager } from '@/features/chat/tabs/TabManager';
import type { TabData } from '@/features/chat/tabs/types';
import { t } from '@/i18n/i18n';
import type SpecoratorPlugin from '@/main';

import { ensureChatTabManager } from './ensureChatTabManager';

/**
 * Resolves the chat tab a library dispatch (vault skill, provider command)
 * should land in for `targetProviderId`:
 *
 * 1. Active tab matches the provider and is a draft-free `blank` → reuse.
 * 2. Else scan the other open tabs for a draft-free blank on the target
 *    provider → reuse it, so a bound or draft-bearing active tab doesn't hit
 *    the tab cap when a safe background blank exists.
 * 3. Else create a new tab pinned to the provider (null at the cap).
 *
 * A blank counts as reusable only when draft-free — no unsent composer text or
 * attached file/folder/image pills — so a dispatch never consumes a user's
 * pending draft during `buildOutgoingTurn`.
 */
export async function resolveProviderChatTab(
  tabManager: TabManager,
  plugin: SpecoratorPlugin,
  targetProviderId: ProviderId,
): Promise<TabData | null> {
  const activeTab = tabManager.getActiveTab();
  // `getAllTabs()` also returns hidden work-order run tabs; exclude them so a
  // library dispatch never lands in a task-run tab (own lifecycle + tab cap).
  const isReusable = (tab: TabData): boolean =>
    tab.lifecycleState === 'blank'
    && tab.kind !== 'work-order'
    && !blankTabHasPendingDraft(tab)
    && getTabProviderId(tab, plugin) === targetProviderId;

  if (activeTab && isReusable(activeTab)) {
    return activeTab;
  }

  const blankMatch = tabManager.getAllTabs().find((tab) => tab !== activeTab && isReusable(tab));
  if (blankMatch) {
    return blankMatch;
  }

  if (!tabManager.canCreateTab()) {
    return null;
  }
  const created = await tabManager.createTab(null, undefined, {
    activate: false,
    defaultProviderId: targetProviderId,
  });
  return created ?? null;
}

export interface LandOnProviderChatTabOptions {
  /**
   * Send into the active tab whenever its provider matches, even when it is
   * bound to a conversation. Slash commands are turns IN a conversation — a
   * conversation-scoped one like `/compact` operates on the transcript it is
   * sent to — so routing them to a blank tab the way skills are routed would
   * compact an empty conversation instead of the one the user was looking at.
   * Skills are new work and keep the draft-free-blank routing.
   */
  preferActiveTab?: boolean;
}

/**
 * Shared prologue for every library dispatch (vault skill, provider command):
 * resolve the chat surface, land on a provider-matched tab, and hand back that
 * tab's input controller, ready to receive the invocation. Returns null when
 * there is no chat surface, the tab cap blocks a target, or the tab has no
 * input controller — a `Notice` has already been shown for the tab cap, so
 * callers just bail.
 *
 * The active tab's attached files/folders/images are snapshotted BEFORE the
 * target is resolved and re-applied AFTER the switch: a dispatch usually lands
 * in a FRESH tab, which does not inherit that context, and `switchToTab`'s
 * welcome reset wipes anything attached beforehand. The picked file/folder pill
 * is attached last, for the same ordering reason.
 */
export async function landOnProviderChatTab(
  plugin: SpecoratorPlugin,
  providerId: ProviderId,
  file: TAbstractFile | null,
  options: LandOnProviderChatTabOptions = {},
): Promise<TabData['controllers']['inputController']> {
  const tabManager = await ensureChatTabManager(plugin);
  if (!tabManager) return null;

  const activeTab = tabManager.getActiveTab();
  if (options.preferActiveTab && activeTab && isCommandTargetableTab(activeTab, plugin, providerId)) {
    // Already on the right conversation: no switch (so nothing resets), and no
    // context carry (the tab keeps its own attachments). Just the picked pill.
    attachPickedContext(activeTab, file);
    return activeTab.controllers.inputController;
  }

  const carriedContext = snapshotUserAttachedContext(activeTab);

  const target = await resolveProviderChatTab(tabManager, plugin, providerId);
  if (!target) {
    new Notice(t('quickActions.contextMenu.tabLimitReached'));
    return null;
  }

  await tabManager.switchToTab(target.id);
  applyUserAttachedContext(target, carriedContext);
  attachPickedContext(target, file);
  return target.controllers.inputController;
}

/**
 * A hidden work-order run tab is never a command target — it has its own
 * lifecycle and would swallow the turn — and neither is a tab on a different
 * provider, whose runtime would not resolve the invocation.
 */
function isCommandTargetableTab(
  tab: TabData,
  plugin: SpecoratorPlugin,
  providerId: ProviderId,
): boolean {
  return tab.kind !== 'work-order' && getTabProviderId(tab, plugin) === providerId;
}

function attachPickedContext(tab: TabData, file: TAbstractFile | null): void {
  if (file instanceof TFile) {
    tab.ui.fileContextManager?.attachFileAsPill(file.path);
  } else if (file instanceof TFolder) {
    tab.ui.fileContextManager?.attachFolderAsPill(file.path);
  }
}
