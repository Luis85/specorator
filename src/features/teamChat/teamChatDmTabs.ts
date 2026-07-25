import { Notice } from 'obsidian';

import { t } from '../../i18n/i18n';
import type SpecoratorPlugin from '../../main';
import type { TabManager } from '../chat/tabs/TabManager';
import type { PersistedTabManagerState } from '../chat/tabs/types';
import { getTeamChatDmOpenCoordinator } from './TeamChatDmOpenCoordinator';

/**
 * Restores persisted Team Chat DM tabs with the SAME guards the `selectAgent` open
 * path has and `TabManager.restoreState` bypasses:
 *  - Validate (Fix 2, :225): only conversations that still exist AND are team-chat
 *    DMs, so a deleted/corrupted/absent-after-sync mapping can't `createTab` a blank
 *    UNBOUND chat tab (the composer would then mint an ordinary chat).
 *  - Dedup + serialize (Fix 1, :225): open each surviving DM at most once
 *    plugin-wide via `getTeamChatDmOpenCoordinator` (per conversationId) with an
 *    in-body `findConversationAcrossViews` check — so two leaves restoring the same
 *    id (duplicated persisted tab, ~concurrent on reload), or a restore racing a
 *    `selectAgent` open, collapse to exactly ONE controller.
 * Never creates a blank fallback tab (an empty Team Chat is just roster + empty pane).
 */
export async function restoreTeamChatDmTabs(
  plugin: SpecoratorPlugin,
  manager: TabManager,
  persisted: PersistedTabManagerState,
): Promise<void> {
  const restorable = persisted.openTabs.filter((tab) => isRestorableTeamChatDm(plugin, tab.conversationId));
  if (restorable.length === 0) return;

  // Pre-warm hydration in parallel (BaseHistoryService dedupes the createTab
  // re-fetch); without this the UI freezes for the sum of every transcript load.
  await Promise.all(
    restorable
      .map((tab) => tab.conversationId)
      .filter((id): id is string => typeof id === 'string')
      .map((id) => plugin.getConversationById(id).catch(() => null)),
  );

  const coordinator = getTeamChatDmOpenCoordinator(plugin);
  for (const tab of restorable) {
    const conversationId = tab.conversationId;
    if (typeof conversationId !== 'string') continue; // validated above; narrows the type
    await coordinator.serialize(conversationId, async () => {
      // Skip a DM already open — in another leaf, an earlier iteration, or the first
      // of two concurrent same-id restores/opens.
      if (plugin.findConversationAcrossViews(conversationId)) return;
      await manager.createTab(conversationId, tab.tabId, { activate: false, kind: 'chat' });
    });
  }

  // Switch to the persisted active DM if its tab survived (its onTabSwitched drives
  // the selectedAgentId projection), else the first restored tab — never a blank one.
  const targetTabId = persisted.activeTabId && manager.hasTab(persisted.activeTabId)
    ? persisted.activeTabId
    : restorable.map((tab) => tab.tabId).find((id) => manager.hasTab(id)) ?? null;
  if (targetTabId) {
    await manager.switchToTab(targetTabId);
  }
}

/**
 * Force-closes the old-provider DM tab a provider-change rotation left behind, in
 * whichever leaf owns it (cross-leaf via `findConversationAcrossViews`), so its
 * runtime disposes and its chat slot frees. No-ops unless the NEW tab actually
 * opened, so a cap-blocked rotation can't strand the agent with no tab. The old tab
 * is located by the OLD conversationId (≠ new), so it is never the just-opened one.
 */
export async function closeRotatedDmTab(
  plugin: SpecoratorPlugin,
  previousConversationId: string,
  newConversationId: string,
): Promise<void> {
  if (!plugin.findConversationAcrossViews(newConversationId)) return;
  const stale = plugin.findConversationAcrossViews(previousConversationId);
  if (!stale) return;
  await stale.view.getTabManager()?.closeTab(stale.tabId, true);
}

/** A persisted tab is restorable only if its conversation still exists AND is a real
 *  team-chat DM — `surface === 'team-chat'` AND a bound agent, both required. An ordinary
 *  roster-agent chat (`surface: 'chat'` with a boundAgentId, e.g. from synced/hand-edited
 *  view state) is rejected: restoring it into the Team Chat leaf would escape the
 *  surface-keyed DM protections (fork disable, `$`-resume suppression, DM mapping), matching
 *  Round-36's `isConversationUsable` gate. Otherwise restoring mints a stray/unbound tab. */
function isRestorableTeamChatDm(plugin: SpecoratorPlugin, conversationId: string | null): boolean {
  if (typeof conversationId !== 'string' || conversationId.length === 0) return false;
  const conversation = plugin.getConversationSync(conversationId);
  return conversation != null && conversation.surface === 'team-chat' && Boolean(conversation.boundAgentId);
}

/** Old-provider DMs displaced by a provider-change rotation whose replacement open
 *  hasn't opened yet (e.g. it hit the tab cap), keyed agentId → old conversationId,
 *  per plugin instance. A retry that finally opens the replacement drains it. */
const displacedDmByAgent = new WeakMap<SpecoratorPlugin, Map<string, string>>();

function getDisplacedDmRegistry(plugin: SpecoratorPlugin): Map<string, string> {
  let registry = displacedDmByAgent.get(plugin);
  if (!registry) {
    registry = new Map();
    displacedDmByAgent.set(plugin, registry);
  }
  return registry;
}

/**
 * Handles a provider-change rotation for an agent's DM: when the mapping rotated to
 * a fresh conversation, record the displaced old DM and tell the user why the prior
 * transcript went away (BEFORE any close). Then — this call OR a later one — close
 * the displaced DM once its replacement is actually open, and clear the record.
 *
 * The deferral (:361) matters because a cap-blocked rotation leaves the old tab AND
 * `resolveOrCreate` has already remapped, so the NEXT click sees prev === current and
 * never re-detects the rotation; the persisted `displaced` id lets the retry that
 * finally opens the replacement close the stale old-provider tab and free its slot.
 */
export async function reconcileRotation(
  plugin: SpecoratorPlugin,
  agentId: string,
  previousConversationId: string | null,
  conversationId: string,
): Promise<void> {
  const displaced = getDisplacedDmRegistry(plugin);
  if (previousConversationId && previousConversationId !== conversationId) {
    displaced.set(agentId, previousConversationId);
    const agent = await plugin.agentRosterStore.get(agentId);
    new Notice(t('teamChat.providerRotated', { agent: agent?.name ?? agentId }));
  }
  const displacedId = displaced.get(agentId);
  if (displacedId && displacedId !== conversationId && plugin.findConversationAcrossViews(conversationId)) {
    await closeRotatedDmTab(plugin, displacedId, conversationId);
    displaced.delete(agentId);
  }
}
