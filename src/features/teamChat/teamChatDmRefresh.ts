import { getHiddenProviderCommandSet } from '../../core/providers/commands/hiddenCommands';
import { ProviderRegistry } from '../../core/providers/ProviderRegistry';
import { ProviderSettingsCoordinator } from '../../core/providers/ProviderSettingsCoordinator';
import type SpecoratorPlugin from '../../main';
import { getTabProviderId } from '../chat/tabs/providerResolution';
import { onProviderAvailabilityChanged } from '../chat/tabs/tabProviderSync';
import type { TabData } from '../chat/tabs/types';
import type { ComposerEditedFile } from '../chat/ui/vue/composer/stores/composerStore';
import { deriveEditedFilesFromMessages } from '../chat/utils/editedFiles';
import { basename, parentDir } from '../chat/utils/pathLabel';
import { recalculateUsageForModel } from '../chat/utils/usageInfo';
import { resolveModelContextWindow } from '../settings/customModels/resolveModelContextWindow';
import { resolveTeamChatAgentProvider } from './resolveTeamChatAgentProvider';

/**
 * DM-scoped mirrors of SpecoratorView's cross-tab refresh loops, applied to the
 * Team-Chat manager's open DM tabs. Extracted so `TeamChatView` stays a thin host
 * (the loops would push it past its LOC ceiling) AND so the sidebar's real behavior
 * is reused verbatim rather than re-implemented — a drifting second copy would let a
 * Team Chat DM's model/usage/edited-files projection disagree with the sidebar's.
 */

/**
 * Mirror of `SpecoratorView.refreshModelSelector`'s per-tab loop: detach any stale
 * runtime, recompute the model-dependent context window + usage, and re-project the
 * composer so the (Vue) model selector and usage repaint from the store. The caller
 * owns the surrounding store re-project + `primeProviderRuntime`, exactly as
 * SpecoratorView does around this loop.
 */
export function refreshDmModelState(plugin: SpecoratorPlugin, tabs: readonly TabData[]): void {
  for (const tab of tabs) {
    detachStaleTabRuntime(plugin, tab);
    const providerId = getTabProviderId(tab, plugin);
    const providerSettings = ProviderSettingsCoordinator.getProviderSettingsSnapshot(plugin.settings, providerId);
    // The context window feeds only the usage recompute, so derive it lazily inside
    // the guard — behavior-identical to SpecoratorView, which computes it eagerly and
    // simply drops it when the tab has no usage yet.
    if (tab.state.usage) {
      const contextWindow = resolveModelContextWindow(
        ProviderRegistry.getChatUIConfig(providerId),
        providerSettings,
        providerSettings.model,
        providerSettings.customContextLimits,
      );
      tab.state.usage = recalculateUsageForModel(tab.state.usage, providerSettings.model, contextWindow);
    }
    // The toolbar widgets are Vue; re-project so they repaint from the store.
    tab.composer?.emit();
  }
}

/**
 * Re-resolves one tab's provider availability, detaching any now-stale runtime and
 * logging an async cleanup failure. `onProviderAvailabilityChanged` detaches
 * synchronously and tracks its async cleanup on the tab; replacement construction
 * awaits that, so this fire-and-forget call never overlaps two CLI processes.
 */
function detachStaleTabRuntime(plugin: SpecoratorPlugin, tab: TabData): void {
  onProviderAvailabilityChanged(tab, plugin).catch((error) =>
    plugin.logger.scope('team-chat').error('provider-availability runtime cleanup failed', error),
  );
}

/**
 * Mirror of `SpecoratorView.applyEditedFilesSetting`: clears each open DM's
 * edited-files list when the setting is disabled — hiding BOTH the composer and the
 * top-bar strips, which project the same `tab.state.editedFiles` — and rebuilds it
 * from the transcript when re-enabled. No open DM → nothing to apply (and the
 * settings read is skipped, so a torn-down host with no `settings` can't throw).
 */
export function applyDmEditedFilesSetting(plugin: SpecoratorPlugin, tabs: readonly TabData[]): void {
  if (tabs.length === 0) return;
  const enabled = plugin.settings.showAgentEditedFiles !== false;
  for (const tab of tabs) {
    if (enabled) {
      tab.state.setEditedFiles(deriveEditedFilesFromMessages(plugin.app, tab.state.messages));
    } else {
      tab.state.clearEditedFiles();
    }
  }
}

/**
 * Projects the ACTIVE DM tab's created/edited files onto the top-bar strip's display shape
 * — the same synchronous `tab.state.editedFiles` → `{ path, changeKind, name, dir }` mapping
 * the composer strip uses, so both strips read one truth. A pure projection (unlike the
 * side-effecting refresh loops here); empty when no DM tab is active.
 */
export function projectActiveDmEditedFiles(activeTab: TabData | null): ComposerEditedFile[] {
  return (activeTab?.state.editedFiles ?? []).map((entry) => ({
    path: entry.path,
    changeKind: entry.changeKind,
    name: basename(entry.path),
    dir: parentDir(entry.path),
  }));
}

/**
 * Mirror of `SpecoratorView.updateHiddenProviderCommands`: re-applies the
 * provider-scoped `hiddenProviderCommands` set to each open DM's persistent
 * slash-command dropdown, so a settings change repaints the LIVE dropdown rather
 * than only the next-opened one. Extracted here (not inlined in `TeamChatView`) to
 * keep the view under its LOC ceiling and to reuse the sidebar's exact per-tab call.
 */
export function applyDmHiddenCommands(plugin: SpecoratorPlugin, tabs: readonly TabData[]): void {
  for (const tab of tabs) {
    tab.ui.slashCommandDropdown?.setHiddenCommands(
      getHiddenProviderCommandSet(plugin.settings, getTabProviderId(tab, plugin)),
    );
  }
}

/**
 * The bound agents whose open DM now runs on the WRONG provider: the user re-pointed
 * the agent at another backend, and a DM's `providerId` is immutable, so the mapped
 * conversation is stale and must rotate. Deduped (defensive). An unknown agent
 * (undefined expected provider) is never collected — there is nothing to rotate
 * toward, matching the thread store's own reuse gate.
 */
export async function collectDmsNeedingProviderRotation(
  plugin: SpecoratorPlugin,
  tabs: readonly TabData[],
): Promise<string[]> {
  const agentIds = new Set<string>();
  for (const tab of tabs) {
    const conversation = tab.conversationId ? plugin.getConversationSync(tab.conversationId) : null;
    const agentId = conversation?.boundAgentId;
    if (!agentId) continue;
    const expectedProvider = await resolveTeamChatAgentProvider(plugin, agentId);
    if (expectedProvider !== undefined && conversation.providerId !== expectedProvider) {
      agentIds.add(agentId);
    }
  }
  return [...agentIds];
}

/**
 * Rotates every open DM whose agent's provider changed, through the caller's
 * `rotate` (the view's `selectAgent`) so the Round-34 rotation notice + old-tab
 * close apply. Agents are collected BEFORE rotating because `selectAgent` mutates
 * the tab set (opens the fresh DM, closes the old one). No mismatch → no rotation.
 */
export async function rotateChangedDmProviders(
  plugin: SpecoratorPlugin,
  tabs: readonly TabData[],
  rotate: (agentId: string) => Promise<void>,
): Promise<void> {
  for (const agentId of await collectDmsNeedingProviderRotation(plugin, tabs)) {
    await rotate(agentId);
  }
}
