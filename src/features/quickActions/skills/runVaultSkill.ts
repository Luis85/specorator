import { Notice, type TAbstractFile, TFile, TFolder } from 'obsidian';

import { ProviderRegistry } from '@/core/providers/ProviderRegistry';
import type { ProviderId } from '@/core/providers/types';
import { asSettingsBag } from '@/core/types/settings';
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

import { ensureChatTabManager } from '../ensureChatTabManager';
import type { SkillTabEntry } from './types';

/**
 * Routes execution of a vault skill to a chat tab matching the skill's
 * provider, attaches the optional file/folder as a context pill, and sends
 * the provider-native skill invocation (`$name` or `/name`).
 *
 * Provider-enable state is re-checked at execution time via
 * `ProviderRegistry.isEnabled` — `SkillTabEntry.providerEnabled` is a
 * listing-time cache for picker dimming, so a provider toggled while the
 * modal was open must not silently send into a disabled provider, and a
 * provider re-enabled while the modal was open must not silently fail.
 *
 * Tab routing order (a "blank" tab is only reusable when draft-free — no unsent
 * composer text or attached file/folder/image context — so a library skill send
 * never consumes a user's pending draft during `buildOutgoingTurn`):
 * 1. Active tab matches provider and is a draft-free blank → reuse.
 * 2. Else scan the other open tabs for a draft-free blank on the target provider
 *    → reuse it (so a bound or draft-bearing active tab doesn't hit the tab cap
 *    when a safe background blank exists).
 * 3. Else create a new tab with `defaultProviderId` (null at the cap).
 *
 * Pill attach MUST happen AFTER switchToTab — initializeWelcome on a blank
 * tab wipes any pill attached before the switch. See openContextMenuQuickAction
 * for the same ordering rationale.
 */
export async function runVaultSkill(
  plugin: SpecoratorPlugin,
  entry: SkillTabEntry,
  file: TAbstractFile | null,
): Promise<void> {
  const settingsBag = asSettingsBag(plugin.settings);
  const enabledNow = ProviderRegistry.isEnabled(entry.providerId, settingsBag);
  if (!enabledNow) {
    new Notice(
      t('quickActions.skills.providerDisabled', { provider: entry.providerDisplayName }),
    );
    return;
  }

  // A global (`~/.claude/skills`) skill is listed regardless of the provider's
  // user-scope setting (discovery is deliberately ungated), but `/name` only
  // resolves when the provider loads user scope. Refuse up front rather than
  // dispatch a `/name` that the runtime silently drops. Re-checked live here so
  // toggling the setting takes effect without touching the cached listing.
  if (
    entry.scope === 'user'
    && !ProviderRegistry.resolvesUserScopeSkills(entry.providerId, settingsBag)
  ) {
    new Notice(
      t('quickActions.skills.userSettingsRequired', { provider: entry.providerDisplayName }),
    );
    return;
  }

  const tabManager = await ensureChatTabManager(plugin);
  if (!tabManager) return;

  // Snapshot the active tab's attached files/folders BEFORE resolving/switching
  // so a skill that lands in a fresh tab still sends the context the user set up
  // (switchToTab's welcome reset wipes pills). Mirrors runQuickActionForFile.
  const carriedContext = snapshotUserAttachedContext(tabManager.getActiveTab());

  const target = await resolveTargetTab(tabManager, plugin, entry.providerId);
  if (!target) {
    new Notice(t('quickActions.contextMenu.tabLimitReached'));
    return;
  }

  await tabManager.switchToTab(target.id);

  applyUserAttachedContext(target, carriedContext);

  if (file instanceof TFile) {
    target.ui.fileContextManager?.attachFileAsPill(file.path);
  } else if (file instanceof TFolder) {
    target.ui.fileContextManager?.attachFolderAsPill(file.path);
  }

  const content = `${entry.insertPrefix}${entry.name}`;
  const inputController = target.controllers.inputController;
  if (!inputController) return;
  await inputController.sendMessage({ content });
  plugin.events.emit('usage.recorded', {
    kind: 'skill',
    name: entry.name,
    providerId: entry.providerId,
  });
}

async function resolveTargetTab(
  tabManager: TabManager,
  plugin: SpecoratorPlugin,
  targetProviderId: ProviderId,
): Promise<TabData | null> {
  const activeTab = tabManager.getActiveTab();
  // `getAllTabs()` also returns hidden work-order run tabs; exclude them so a
  // library skill send never lands in a task-run tab (own lifecycle + tab cap).
  const isReusable = (tab: TabData): boolean =>
    tab.lifecycleState === 'blank'
    && tab.kind !== 'work-order'
    && !blankTabHasPendingDraft(tab)
    && getTabProviderId(tab, plugin) === targetProviderId;

  if (activeTab && isReusable(activeTab)) {
    return activeTab;
  }

  // The active tab isn't a safe target (wrong provider, not blank, or a
  // draft-bearing blank). Scan any OTHER open tab for a draft-free provider
  // match before creating/failing — otherwise a bound or draft-bearing active
  // tab would hit the tab cap even though a safe background blank exists.
  const blankMatch = tabManager.getAllTabs().find((tab) => tab !== activeTab && isReusable(tab));
  if (blankMatch) {
    return blankMatch;
  }

  return createTabForProvider(tabManager, targetProviderId);
}

async function createTabForProvider(
  tabManager: TabManager,
  providerId: ProviderId,
): Promise<TabData | null> {
  if (!tabManager.canCreateTab()) {
    return null;
  }
  const created = await tabManager.createTab(null, undefined, {
    activate: false,
    defaultProviderId: providerId,
  });
  return created ?? null;
}
