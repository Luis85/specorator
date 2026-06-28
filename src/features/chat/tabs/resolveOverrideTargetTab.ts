import type { ProviderId } from '@/core/providers/types';
import type SpecoratorPlugin from '@/main';

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
 * Resolve the tab a provider+model override should target. Reuses the active
 * blank tab only when BOTH its provider and effective model match the override
 * (`switchToTab` carries no model, so a mismatched pinned tab would silently
 * drop the picked model); otherwise creates a fresh tab pinned to the override.
 * Returns null at the tab limit. With no override, reuses any blank active tab.
 */
export async function resolveOverrideTargetTab(
  plugin: SpecoratorPlugin,
  tabManager: TabManager,
  override?: TabModelOverride,
): Promise<TabData | null> {
  const activeTab = tabManager.getActiveTab();
  const isBlank = activeTab?.lifecycleState === 'blank';
  // When an override is present, the active blank tab is only reusable if its
  // provider AND its currently effective model both match the override. The
  // provider check alone is not enough: `switchToTab` does not accept a model,
  // so a blank Claude tab pinned to claude-haiku would silently drop the user's
  // claude-sonnet pick from the launch modal.
  const overrideMatchesActive = override !== undefined && isBlank && activeTab
    ? getTabProviderId(activeTab, plugin) === override.providerId
      && resolveActiveBlankTabModel(activeTab, plugin, override.providerId) === override.model
    : false;

  if (override === undefined && isBlank && activeTab) return activeTab;
  if (overrideMatchesActive && activeTab) return activeTab;
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
