import type { ProviderId } from '@/core/providers/types';
import type SpecoratorPlugin from '@/main';

import { blankTabHasPendingDraft } from './blankTabDraft';
import { getTabProviderId } from './providerResolution';
import type { TabManager } from './TabManager';
import { resolveBlankTabModel } from './tabShared';
import type { TabData } from './types';

export interface TabModelOverride { providerId: ProviderId; model: string }

/**
 * Resolve the effective model a blank tab is currently using, mirroring the
 * resolution order in `tabControllers.getTabModelOverride` and `tabUi`:
 *   1. `pinnedModel` — survives runtime init
 *   2. `draftModel` — composer-picked, only on blank tabs
 *   3. provider-projected blank model fallback
 */
function resolveActiveBlankTabModel(
  tab: Pick<TabData, 'pinnedModel' | 'draftModel'>,
  plugin: SpecoratorPlugin,
  providerId: ProviderId,
): string {
  if (typeof tab.pinnedModel === 'string' && tab.pinnedModel.trim()) {
    return tab.pinnedModel.trim();
  }
  if (typeof tab.draftModel === 'string' && tab.draftModel.trim()) {
    return tab.draftModel.trim();
  }
  return resolveBlankTabModel(plugin, providerId);
}

/**
 * Additive callers (loop-prompt seeding via `seedComposerDraft({ keepExisting })`)
 * preserve any unsent draft and never send or clear pills, so they may reuse a
 * draft-bearing blank. Destructive send callers (quick actions, library skills)
 * must not — reusing would consume the draft's context during `buildOutgoingTurn`.
 */
export interface ResolveTargetOptions { allowDraftBlank?: boolean }

/**
 * A blank tab is a safe reuse target when it holds no pending draft (unless the
 * caller opts into draft reuse) AND either there is no override, or BOTH its
 * provider and its currently effective model match the override. The provider
 * check alone is not enough: `switchToTab` does not accept a model, so a blank
 * Claude tab pinned to claude-haiku would silently drop the user's claude-sonnet
 * pick from the launch modal.
 */
function isReusableBlankTab(
  tab: TabData,
  plugin: SpecoratorPlugin,
  override: TabModelOverride | undefined,
  options: ResolveTargetOptions,
): boolean {
  if (tab.lifecycleState !== 'blank') return false;
  if (!options.allowDraftBlank && blankTabHasPendingDraft(tab)) return false;
  if (override === undefined) return true;
  return getTabProviderId(tab, plugin) === override.providerId
    && resolveActiveBlankTabModel(tab, plugin, override.providerId) === override.model;
}

/**
 * Resolve the tab a provider+model override should target. Prefers the active
 * blank tab when it matches, then any other open blank tab that matches, before
 * creating a fresh tab pinned to the override. Only returns null at the tab
 * limit when no reusable blank tab exists — a matching blank elsewhere is a safe
 * target and must not be skipped straight into a spurious tab-limit failure.
 */
export async function resolveOverrideTargetTab(
  plugin: SpecoratorPlugin,
  tabManager: TabManager,
  override?: TabModelOverride,
  options: ResolveTargetOptions = {},
): Promise<TabData | null> {
  const activeTab = tabManager.getActiveTab();
  if (activeTab && isReusableBlankTab(activeTab, plugin, override, options)) return activeTab;

  // Reuse any other open blank tab that matches before creating or failing at
  // the cap — the active tab may be a conversation while a safe blank exists.
  for (const tab of tabManager.getAllTabs()) {
    if (tab !== activeTab && isReusableBlankTab(tab, plugin, override, options)) return tab;
  }

  if (tabManager.canCreateTab()) {
    const created = await tabManager.createTab(null, undefined, {
      activate: false,
      ...(override !== undefined
        ? { defaultProviderId: override.providerId, pinnedModel: override.model }
        : {}),
    });
    return created ?? null;
  }
  return null;
}
