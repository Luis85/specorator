import { Notice } from 'obsidian';

import { getHiddenProviderCommandSet } from '../../core/providers/commands/hiddenCommands';
import { ProviderRegistry } from '../../core/providers/ProviderRegistry';
import { ProviderSettingsCoordinator } from '../../core/providers/ProviderSettingsCoordinator';
import { t } from '../../i18n/i18n';
import type SpecoratorPlugin from '../../main';
import { rosterAgentToPersona } from '../agents/personaRegistry';
import { teamChatDmBoundAgentId } from '../chat/controllers/teamChatSurface';
import { getTabProviderId } from '../chat/tabs/providerResolution';
import { onProviderAvailabilityChanged } from '../chat/tabs/tabProviderSync';
import { getTabChatUIConfig } from '../chat/tabs/tabShared';
import { getComposerToolbarSettings } from '../chat/tabs/tabUi';
import type { TabData } from '../chat/tabs/types';
import type { ComposerEditedFile } from '../chat/ui/vue/composer/stores/composerStore';
import { deriveEditedFilesFromMessages } from '../chat/utils/editedFiles';
import { basename, parentDir } from '../chat/utils/pathLabel';
import { recalculateUsageForModel } from '../chat/utils/usageInfo';
import { resolveModelContextWindow } from '../settings/customModels/resolveModelContextWindow';
import { resolveTeamChatAgentProvider } from './resolveTeamChatAgentProvider';
import { projectCrossLeafPresence } from './teamChatPresence';
import { deriveUnreadAgents, projectThreadMetas, updateSeenBaseline } from './teamChatThreadMeta';
import type { TeamChatSnapshot } from './ui/vue/teamChatCallbacks';

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
 * Projects the ACTIVE DM tab's bound provider id — its conversation's `providerId`,
 * or null when no DM tab is active / the tab carries no conversation. A pure
 * projection like `projectActiveDmEditedFiles`; the top bar resolves it to a
 * display-name chip so a DM whose provider is unavailable (or whose CLI fails) still
 * shows which backend it runs on, and it re-derives across a provider-change rotation
 * (which swaps the active conversation) since it reads the tab's live conversation.
 */
export function projectActiveDmProviderId(plugin: SpecoratorPlugin, activeTab: TabData | null): string | null {
  const conversationId = activeTab?.conversationId;
  return conversationId ? plugin.getConversationSync(conversationId)?.providerId ?? null : null;
}

/**
 * Resolves each DM tab's bound-agent persona and PUSHES it into that tab's transcript
 * projection, which re-emits so the attribution headers repaint.
 *
 * Pushed rather than pulled because the roster store is ASYNC while the transcript reads the
 * identity from a render computed: a callback read there is untracked and would cache its
 * first (usually null) value, leaving a restored transcript anonymous and a renamed agent
 * stale. Mirrors `SpecoratorView.refreshBoundAgentChip`'s resolve-then-project shape.
 *
 * The projection keys the persona by conversation id, so a provider-change rotation
 * invalidates it rather than attributing the fresh thread to the previous agent. A deleted
 * agent pushes null — a read-only DM renders anonymously rather than over a name that no
 * longer exists.
 */
export async function refreshDmAgentPersonas(
  plugin: SpecoratorPlugin,
  tabs: readonly TabData[],
): Promise<void> {
  for (const tab of tabs) {
    const conversationId = tab.conversationId;
    const agentId = conversationId ? teamChatDmBoundAgentId(plugin, conversationId) : null;
    if (!agentId) {
      tab.transcript?.setMessageIdentity(null, conversationId);
      continue;
    }
    // Sequential, not Promise.all: the hot-DM budget caps this at a handful of tabs, and
    // the roster store's own read cache makes the repeated lookups cheap.
    const agent = await plugin.agentRosterStore?.get(agentId);
    // Re-check identity after the await — a rotation or close during the lookup must not
    // publish a persona for a conversation this tab no longer holds.
    if (tab.conversationId !== conversationId) continue;
    tab.transcript?.setMessageIdentity(agent ? rosterAgentToPersona(agent) : null, conversationId);
  }
}

/**
 * Projects the ACTIVE DM tab's model LABEL for the top bar's chip, through the same two
 * steps the composer's model selector uses: `getComposerToolbarSettings` for the value
 * (pinned > blank draft > bound-agent display seed > provider snapshot), then the provider's
 * `getModelOptions()` for its display label. Both halves matter — resolving only the value
 * would still render a raw id beside a composer showing the friendly name, i.e. two names
 * for one model in a single pane (`tabComposer.ts:105` is the counterpart).
 *
 * Falls back to the raw id when the provider lists no matching option, exactly as the
 * composer does. Null (never a placeholder) when there is no active DM or no model yet, so
 * the chip hides rather than rendering an empty slot.
 */
export function projectActiveDmModelLabel(plugin: SpecoratorPlugin, activeTab: TabData | null): string | null {
  if (!activeTab) return null;
  try {
    const settings = getComposerToolbarSettings(activeTab, plugin);
    const model = settings.model?.trim();
    if (!model) return null;
    const options = getTabChatUIConfig(activeTab, plugin).getModelOptions({
      ...settings,
      environmentVariables: plugin.getActiveEnvironmentVariables(),
    });
    return options.find((option) => option.value === model)?.label ?? model;
  } catch (error) {
    // `getComposerToolbarSettings` reaches through the provider-settings coordinator — a
    // deeper call chain than anything else in this snapshot. This projection runs on EVERY
    // stream frame and assembles the whole Team Chat read-model, so letting a model-resolution
    // failure propagate would take down presence, selection, and the roster previews along
    // with the chip. Degrade to "no chip" and log; never fail the emit.
    plugin.logger.scope('team-chat').error('model projection failed', error);
    return null;
  }
}

/**
 * Per-leaf context the snapshot projection needs but cannot derive itself, because both
 * halves are owned by the view: the thread map (refreshed off `TeamChatThreadStore` on
 * open + `teamChat:threads-changed`, never awaited from a render path) and the leaf's
 * last-seen stamps.
 */
export interface TeamChatProjectionContext {
  /** `agentId → conversationId` for every mapped DM, open or not. */
  agentThreads: Record<string, string>;
  /** Per-leaf unread baseline. MUTATED here (seeded) — see `seedLastSeen`. */
  lastSeenByAgent: Map<string, number>;
  /** Per-leaf holder for the previously-active agent, so the projection can tell a
   *  switch-away from an ordinary re-projection. MUTATED here — see `updateSeenBaseline`. */
  activeAgentTracker: { previousActiveAgentId: string | null };
}

/**
 * The full `TeamChatSnapshot` the view fans to its store observers, assembled from the
 * active DM tab: the edited-files strip + provider/model chips all project off it, presence
 * is the cross-leaf idle/busy aggregate, and the roster's preview/timestamp/unread trio
 * projects off the leaf's thread map. A projection kept here beside the other DM-scoped
 * projections (rather than inline in `TeamChatView`) so the view stays a thin host — the same
 * reason the refresh loops live in this module.
 *
 * Runs on every stream frame, so every branch is synchronous: no vault I/O, and an unmapped
 * or unloaded conversation is omitted rather than awaited (`projectThreadMetas`).
 */
export function projectTeamChatSnapshot(
  plugin: SpecoratorPlugin,
  activeTab: TabData | null,
  selectedAgentId: string | null,
  context: TeamChatProjectionContext,
): TeamChatSnapshot {
  const threads = projectThreadMetas(plugin, context.agentThreads);
  // Update the baseline BEFORE deriving: an agent's first observed projection establishes
  // its baseline (never unread), and the active DM re-stamps every frame so the thread you
  // are watching stays seen. Only a bump to a NON-active, already-seen thread lights a row.
  updateSeenBaseline(threads, context.lastSeenByAgent, selectedAgentId, context.activeAgentTracker);
  return {
    selectedAgentId,
    editedFiles: projectActiveDmEditedFiles(activeTab),
    presence: projectCrossLeafPresence(plugin),
    activeProviderId: projectActiveDmProviderId(plugin, activeTab),
    activeModelLabel: projectActiveDmModelLabel(plugin, activeTab),
    threads,
    unread: deriveUnreadAgents(threads, context.lastSeenByAgent, selectedAgentId),
    // Read off the tab's live ChatState rather than the conversation record: during
    // hydration the conversation can still be empty while the tab already has messages,
    // and the starter row must disappear the moment the first turn renders.
    // Chained all the way down, not just past `activeTab`: this projection also runs while
    // a tab is mid-construction (created, ChatState not yet populated), where `messages` is
    // legitimately absent. Treating that as "empty" is right — there is nothing to show yet.
    activeDmIsEmpty: Boolean(activeTab) && (activeTab?.state?.messages?.length ?? 0) === 0,
  };
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
 * conversation is stale and must rotate. Each is paired with the mismatched TAB's OWN
 * `conversationId` — the tab to displace — so the rotation closes/reuses the actually-open
 * old-provider tab even after the store mapping has itself rotated (Round-48 Fix A: a
 * reload can no longer recover the displaced id from an in-memory registry). Deduped by
 * agentId (keep first). An unknown agent (undefined expected provider) is never collected —
 * there is nothing to rotate toward, matching the thread store's own reuse gate.
 */
export async function collectDmsNeedingProviderRotation(
  plugin: SpecoratorPlugin,
  tabs: readonly TabData[],
): Promise<Array<{ agentId: string; staleConversationId: string }>> {
  const seen = new Set<string>();
  const rotations: Array<{ agentId: string; staleConversationId: string }> = [];
  for (const tab of tabs) {
    const staleConversationId = tab.conversationId;
    const conversation = staleConversationId ? plugin.getConversationSync(staleConversationId) : null;
    const agentId = conversation?.boundAgentId;
    if (!agentId || !staleConversationId || seen.has(agentId)) continue;
    const expectedProvider = await resolveTeamChatAgentProvider(plugin, agentId);
    if (expectedProvider !== undefined && conversation.providerId !== expectedProvider) {
      seen.add(agentId);
      rotations.push({ agentId, staleConversationId });
    }
  }
  return rotations;
}

/**
 * Rotates every open DM whose agent's provider changed, through the caller's
 * `rotate` (the view's `selectAgent`) so the Round-34 rotation notice + old-tab
 * close apply. The mismatched tab's own id is threaded as the displaced id so the
 * close/slot-reuse targets the actually-open old-provider tab (Round-48 Fix A).
 * Agents are collected BEFORE rotating because `selectAgent` mutates the tab set
 * (opens the fresh DM, closes the old one). No mismatch → no rotation.
 */
export async function rotateChangedDmProviders(
  plugin: SpecoratorPlugin,
  tabs: readonly TabData[],
  rotate: (agentId: string, staleConversationId: string) => Promise<void>,
): Promise<void> {
  for (const entry of await collectDmsNeedingProviderRotation(plugin, tabs)) {
    await rotate(entry.agentId, entry.staleConversationId);
  }
}

/**
 * Round-42: reconcile the just-restored DM tabs against their agents' CURRENT provider. After a
 * deferred/closed Team Chat leaf restores, no startup event guarantees a provider reconcile (the
 * live `roster:changed` path only fires for edits made while the leaf was open), so a DM whose
 * agent's provider changed while closed stays on its immutable old-provider conversation and runs
 * its first turn on the stale provider. This runs the view's existing reconcile (un-grey + rotate
 * any DM whose agent was re-pointed) over the restored DMs, rotating the stale one to a fresh
 * conversation on the new provider. Errors are logged, never left unhandled off the fire-and-forget
 * restore seam. Kept here (not inlined in the view) so `TeamChatView` stays a thin host — the same
 * reason the DM-scoped refresh loops above live in this module.
 */
export async function reconcileRestoredDmProviders(
  plugin: SpecoratorPlugin,
  refreshProviderAvailability: () => Promise<void>,
): Promise<void> {
  try {
    await refreshProviderAvailability();
  } catch (error) {
    plugin.logger.scope('team-chat').error('restored DM provider reconcile failed', error);
  }
}

/**
 * Surfaces the read-only notice for every open DM whose bound agent was DELETED from the
 * roster (Round-39 Concern A). Deduped through `notified` (conversationId set) so a
 * `roster:changed` for an UNRELATED edit does not re-notice an already-flagged DM; a
 * re-created agent (same id) clears its entry so a later deletion re-notices. The
 * send-side read-only block lives in `InputController` (`teamChatDmBoundAgentId`); this is
 * only the proactive surfacing. One roster `list()` per call, not per DM.
 */
export async function noticeRemovedAgentDms(
  plugin: SpecoratorPlugin,
  tabs: readonly TabData[],
  notified: Set<string>,
): Promise<void> {
  if (tabs.length === 0) return;
  const live = new Set((await plugin.agentRosterStore.list()).map((agent) => agent.id));
  for (const tab of tabs) {
    const conversationId = tab.conversationId;
    const conversation = conversationId ? plugin.getConversationSync(conversationId) : null;
    if (!conversationId || conversation?.surface !== 'team-chat' || !conversation.boundAgentId) continue;
    if (live.has(conversation.boundAgentId)) {
      notified.delete(conversationId); // agent present (or re-created) → allow a future re-notice
    } else if (!notified.has(conversationId)) {
      notified.add(conversationId);
      new Notice(t('teamChat.agentRemoved'));
    }
  }
}
