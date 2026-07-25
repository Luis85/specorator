import { Notice, type WorkspaceLeaf } from 'obsidian';

import { t } from '../../i18n/i18n';
import type SpecoratorPlugin from '../../main';
import type { TabManager } from '../chat/tabs/TabManager';
import type { PersistedTabManagerState } from '../chat/tabs/types';
import { getTeamChatDmOpenCoordinator } from './TeamChatDmOpenCoordinator';

/**
 * Body of the serialized DM open, extracted from `TeamChatView.openResolvedDm` (Round-39)
 * to keep the view a thin host: reuse an already-open tab (this leaf or another), else
 * create one here. Re-run safe — a queued second caller for the same conversation re-enters
 * after the first created the tab, finds it, and switches instead of double-mounting.
 * Touches no selection state: the activated tab's `onTabSwitched`/`onTabCreated` drives the
 * view's `selectedAgentId` projection. `isStale()` (the view's generation + manager-identity
 * guard) is re-checked after every await, so a superseded/detached open is a silent no-op
 * rather than a mount into a torn-down or replaced manager.
 */
export async function openResolvedTeamChatDm(
  plugin: SpecoratorPlugin,
  manager: TabManager,
  leaf: WorkspaceLeaf,
  dmRecency: readonly string[],
  conversationId: string,
  isStale: () => boolean,
): Promise<void> {
  // The serialized body may have queued behind another open (or the leaf may have been torn
  // down since it was enqueued); re-check before touching anything.
  if (isStale()) return;
  // Span every Specorator leaf (sidebar + all Team Chat views): a DM already open in another
  // leaf must be revealed, never double-mounted.
  const existing = plugin.findConversationAcrossViews(conversationId);
  if (existing) {
    if (existing.view.leaf === leaf) {
      await manager.switchToTab(existing.tabId);
    } else {
      // Owned by ANOTHER leaf — reveal + switch it there. This leaf's selectedAgentId
      // projects off its OWN active tab, so it correctly stays put; the destination leaf's
      // onTabSwitched projects ITS selection.
      await plugin.app.workspace.revealLeaf(existing.view.leaf);
      // revealLeaf awaited — re-check before the cross-leaf switch.
      if (isStale()) return;
      await existing.view.getTabManager()?.switchToTab(existing.tabId);
    }
    return;
  }
  // Enforce the hot-DM budget: evict the LRU DM before creating so a big roster browses
  // gracefully instead of dead-ending at the cap (T7). Re-check staleness after the close.
  await evictLruDmIfNeeded(plugin, manager, dmRecency, conversationId);
  if (isStale()) return;
  // Team Chat DMs carry their own budget (eviction above), so bypass the shared maxChatTabs.
  const created = await manager.createTab(conversationId, undefined, { activate: true, kind: 'chat', bypassTabLimit: true });
  // Last-resort cap Notice: with eviction + bypass, createTab returns null only on a
  // teardown-window edge, never the ordinary budget path. A stale open isn't a user error.
  if (!created && !isStale()) {
    new Notice(t('teamChat.tabCapReached'));
  }
}

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

/** Minimal manager surface `closeTeamChatDmTab` needs — a bare `closeTab`, satisfied by
 *  both a concrete `TabManager` and the cross-leaf `ChatTabManagerHandle`. */
interface DmTabCloser {
  closeTab(tabId: string, force?: boolean): Promise<boolean>;
}

/**
 * Closes a Team Chat DM tab AND broadcasts `teamChat:presence` so surviving leaves
 * recompute. A force-close (provider rotation, LRU eviction) tears the tab down without
 * firing the streaming callback, so without this broadcast a still-streaming DM would
 * leave other leaves showing its agent `busy` forever (:168). The one place a Team Chat
 * DM tab should be programmatically closed.
 */
export async function closeTeamChatDmTab(
  plugin: SpecoratorPlugin,
  manager: DmTabCloser,
  tabId: string,
): Promise<boolean> {
  const closed = await manager.closeTab(tabId, true);
  plugin.events.emit('teamChat:presence');
  return closed;
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
  const manager = stale.view.getTabManager();
  if (manager) await closeTeamChatDmTab(plugin, manager, stale.tabId);
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

// ============================================
// T7 — bounded hot-DM budget + LRU eviction
//
// Team Chat keeps a small set of HOT DM tabs (active + a few LRU); browsing a large
// roster past the budget evicts the least-recently-active DM instead of hitting the tab
// cap. Team Chat DMs bypass the shared `maxChatTabs` (they carry their own budget), so
// `maxTeamChatDms` is the sole constraint, enforced here by eviction. The evicted DM's
// conversation stays mapped in the thread store, so re-selecting the agent reopens it.
// ============================================

/** Default hot-DM budget when `maxTeamChatDms` is unset — small on purpose (a handful of
 *  live DM runtimes; the rest are one re-select away). */
export const DEFAULT_MAX_TEAM_CHAT_DMS = 5;

/** The hot-DM budget, floored at 2 (the active tab plus at least one evictable other, so
 *  a new DM can always displace a non-active one). */
export function resolveMaxTeamChatDms(settings: { maxTeamChatDms?: number } | undefined): number {
  return Math.max(2, settings?.maxTeamChatDms ?? DEFAULT_MAX_TEAM_CHAT_DMS);
}

/** Minimal open-DM-tab shape the LRU reads (satisfied by `TabData`: `id` + `conversationId`). */
interface DmTabRef {
  readonly id: string;
  readonly conversationId: string | null;
}

/** Manager surface `evictLruDmIfNeeded` drives. `getAllTabs`/`getActiveTabId` are optional
 *  so a partially-built/torn-down manager (or a lean test double) makes eviction a safe
 *  no-op rather than throwing; a real `TabManager` supplies all three. */
interface DmEvictionManager extends DmTabCloser {
  getAllTabs?(): readonly DmTabRef[];
  getActiveTabId?(): string | null;
}

/** Records a DM as most-recently-active (move-to-end), so the head of `recency` is the
 *  least-recently-used. Mutates in place — the view owns the recency array. */
export function touchDmRecency(recency: string[], conversationId: string): void {
  const at = recency.indexOf(conversationId);
  if (at !== -1) recency.splice(at, 1);
  recency.push(conversationId);
}

/** Picks the least-recently-active DM tab to evict — never the active tab, never the one
 *  being opened. A conversation absent from `recency` (never activated) sorts oldest
 *  (`indexOf` → -1). Returns the victim tabId, or null when nothing is evictable. */
export function pickLruDmEviction(
  tabs: readonly DmTabRef[],
  recency: readonly string[],
  activeTabId: string | null,
  openingConversationId: string,
): string | null {
  const candidates = tabs.filter(
    (tab) => tab.conversationId != null
      && tab.id !== activeTabId
      && tab.conversationId !== openingConversationId,
  );
  if (candidates.length === 0) return null;
  let victim = candidates[0];
  for (const candidate of candidates) {
    if (recency.indexOf(candidate.conversationId as string) < recency.indexOf(victim.conversationId as string)) {
      victim = candidate;
    }
  }
  return victim.id;
}

/**
 * Enforces the hot-DM budget before a NEW DM opens: if the manager already holds
 * `maxTeamChatDms` DMs, evict its least-recently-used one (via `closeTeamChatDmTab`, which
 * broadcasts presence) to free a slot. No-op under budget or when the manager can't report
 * its tabs. The caller guards the surrounding generation/stale check; the evicted DM's
 * mapping persists so re-selecting its agent reopens it.
 */
export async function evictLruDmIfNeeded(
  plugin: SpecoratorPlugin,
  manager: DmEvictionManager,
  recency: readonly string[],
  openingConversationId: string,
): Promise<void> {
  const tabs = manager.getAllTabs?.() ?? [];
  if (tabs.length < resolveMaxTeamChatDms(plugin.settings)) return;
  const victimTabId = pickLruDmEviction(tabs, recency, manager.getActiveTabId?.() ?? null, openingConversationId);
  if (victimTabId == null) return;
  await closeTeamChatDmTab(plugin, manager, victimTabId);
}
