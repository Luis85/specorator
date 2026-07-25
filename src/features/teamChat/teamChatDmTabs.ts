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
  options: { isStale: () => boolean; previousConversationId?: string | null; preserveFocus?: boolean },
): Promise<void> {
  const { isStale, previousConversationId = null, preserveFocus = false } = options;
  // The serialized body may have queued behind another open (or the leaf may have been torn
  // down since it was enqueued); re-check before touching anything.
  if (isStale()) return;
  // preserveFocus marks a BACKGROUND provider-change rotation: open quietly (no focus steal) and
  // reuse the displaced old tab's slot. Both decisions are derived off the live manager here.
  const { activate, displacedConversationId } = resolveRotationOpen(manager, conversationId, previousConversationId, preserveFocus);
  // Span every Specorator leaf (sidebar + all Team Chat views): a DM already open in another
  // leaf must be revealed, never double-mounted.
  const existing = plugin.findConversationAcrossViews(conversationId);
  if (existing) {
    // A preserveFocus re-select of an already-open DM must not steal focus (defensive: a fresh
    // rotation id is not open elsewhere, so this only upholds the invariant).
    if (!activate) return;
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
  // Enforce the hot-DM budget and learn whether a slot is free: evict the LRU DM before
  // creating so a big roster browses gracefully instead of dead-ending at the cap (T7). The
  // displaced tab's slot is excluded — reconcileRotation frees it after this replacement opens.
  const hasDmSlot = await evictLruDmIfNeeded(plugin, manager, dmRecency, conversationId, displacedConversationId);
  // Re-check staleness after the eviction close.
  if (isStale()) return;
  // No slot: the budget is full AND every inactive DM is mid-turn, so eviction freed nothing
  // (streaming DMs are never force-closed — Round-41). Opening now would exceed the hot-DM
  // budget and spawn an over-budget runtime, so surface the same cap Notice the createTab
  // dead-end uses and DON'T open. The stale guard just ran, so this is a live selection (Round-43).
  if (!hasDmSlot) {
    new Notice(t('teamChat.tabCapReached'));
    return;
  }
  // Team Chat DMs carry their own budget (eviction above confirmed a slot), so bypass the
  // shared maxChatTabs. `activate` is false for a background rotation of a non-focused DM.
  const created = await manager.createTab(conversationId, undefined, { activate, kind: 'chat', bypassTabLimit: true });
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
  const allRestorable = persisted.openTabs.filter((tab) => isRestorableTeamChatDm(plugin, tab.conversationId));
  if (allRestorable.length === 0) return;
  // Honor Team Chat's OWN budget on restore, not the generic maxChatTabs the createTab cap
  // would otherwise enforce (dropping DMs within maxTeamChatDms): keep at most maxTeamChatDms,
  // trimming the least-recent extras but always keeping the persisted-active one (Round-40).
  const restorable = trimRestorableDmsToBudget(allRestorable, persisted.activeTabId, resolveMaxTeamChatDms(plugin.settings));

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
      // bypassTabLimit: Team Chat's DM budget is maxTeamChatDms (capped above), not the shared
      // maxChatTabs — matching the interactive open path so restore doesn't clip within budget.
      await manager.createTab(conversationId, tab.tabId, { activate: false, kind: 'chat', bypassTabLimit: true });
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

/** Trims a restorable DM set to the hot-DM budget, ALWAYS keeping the persisted-active DM and
 *  dropping the least-recent extras first. Restore has no live activation recency yet, so the
 *  persisted layout order is the age proxy — the recency-less equivalent of the interactive
 *  `pickLruDmEviction` (keep active, evict oldest) applied to the saved set. */
export function trimRestorableDmsToBudget<T extends { tabId: string }>(
  restorable: readonly T[],
  activeTabId: string | null,
  max: number,
): readonly T[] {
  if (restorable.length <= max) return restorable;
  let toDrop = restorable.length - max;
  return restorable.filter((tab) => {
    if (tab.tabId === activeTabId || toDrop === 0) return true;
    toDrop -= 1;
    return false; // drop the earliest non-active DMs (least-recent) down to the budget
  });
}

/** Minimal open-DM-tab shape the LRU reads (satisfied by `TabData`: `id`, `conversationId`,
 *  and `state.isStreaming`). `state` is optional so a lean test double or a torn-down tab that
 *  omits it is treated as not streaming (evictable). */
interface DmTabRef {
  readonly id: string;
  readonly conversationId: string | null;
  readonly state?: { readonly isStreaming?: boolean };
}

/** Manager surface `evictLruDmIfNeeded` drives. `getAllTabs`/`getActiveTabId` are optional
 *  so a partially-built/torn-down manager (or a lean test double) makes eviction a safe
 *  no-op rather than throwing; a real `TabManager` supplies all three. */
interface DmEvictionManager extends DmTabCloser {
  getAllTabs?(): readonly DmTabRef[];
  getActiveTabId?(): string | null;
}

/** The active DM's conversationId, or null when no DM tab is active / the manager can't report
 *  its tabs. Drives the preserveFocus rotation decision (activate the replacement only when the
 *  rotated DM is the one currently in focus). Reads the same optional accessors as the eviction
 *  surface, so a lean/torn-down manager is a safe null rather than a throw. */
function readActiveDmConversationId(manager: DmEvictionManager): string | null {
  const activeTabId = manager.getActiveTabId?.() ?? null;
  if (activeTabId == null) return null;
  return (manager.getAllTabs?.() ?? []).find((tab) => tab.id === activeTabId)?.conversationId ?? null;
}

/**
 * The two rotation-aware open decisions, derived off the caller's options + the live manager:
 *  - `activate`: a user navigation always activates; a background preserveFocus rotation only
 *    when the rotated DM IS the one currently in focus (else the replacement opens quietly, so a
 *    `roster:changed` sync doesn't yank the pane off the DM the user is reading).
 *  - `displacedConversationId`: the old tab a genuine rotation (prev ≠ new) replaces — its slot is
 *    reused by the budget check rather than evicted, since `reconcileRotation` closes it next.
 */
function resolveRotationOpen(
  manager: DmEvictionManager,
  conversationId: string,
  previousConversationId: string | null,
  preserveFocus: boolean,
): { activate: boolean; displacedConversationId: string | null } {
  const activate = !preserveFocus || previousConversationId === readActiveDmConversationId(manager);
  const displacedConversationId =
    previousConversationId != null && previousConversationId !== conversationId ? previousConversationId : null;
  return { activate, displacedConversationId };
}

/** Records a DM as most-recently-active (move-to-end), so the head of `recency` is the
 *  least-recently-used. Mutates in place — the view owns the recency array. */
export function touchDmRecency(recency: string[], conversationId: string): void {
  const at = recency.indexOf(conversationId);
  if (at !== -1) recency.splice(at, 1);
  recency.push(conversationId);
}

/** Picks the least-recently-active IDLE DM tab to evict — never the active tab, never the one
 *  being opened, and never a tab mid-turn. Evicting a STREAMING DM would force-close its runtime
 *  (the eviction close bypasses TabManager's streaming guard) and truncate the background
 *  response the spec promises (:451), so streaming tabs are skipped in favor of an idle
 *  least-recently-used one. A conversation absent from `recency` (never activated) sorts oldest
 *  (`indexOf` → -1). Returns the victim tabId, or null when nothing idle is evictable — e.g.
 *  every non-active DM is still streaming — so the caller frees no slot and the open falls back
 *  to the cap Notice rather than killing a live turn. */
export function pickLruDmEviction(
  tabs: readonly DmTabRef[],
  recency: readonly string[],
  activeTabId: string | null,
  openingConversationId: string,
): string | null {
  const candidates = tabs.filter(
    (tab) => tab.conversationId != null
      && tab.id !== activeTabId
      && tab.conversationId !== openingConversationId
      && !tab.state?.isStreaming,
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
 * Enforces the hot-DM budget before a NEW DM opens AND reports whether a slot is free for it
 * (Round-43). Under budget (or when the manager can't report its tabs) → `true`, no eviction.
 * At/over budget → evict the least-recently-used IDLE DM (via `closeTeamChatDmTab`, which
 * broadcasts presence) and return whether that close actually freed a slot. Returns `false`
 * when nothing idle is evictable — every inactive DM is mid-turn, so `pickLruDmEviction`
 * skips them all (Round-41): the caller must then NOT bypass the cap with an over-budget
 * runtime and instead surfaces the cap Notice. The caller guards the surrounding
 * generation/stale check; an evicted DM's mapping persists so re-selecting its agent reopens it.
 *
 * `displacedConversationId` (Round-45): the old tab a provider-change rotation is replacing.
 * reconcileRotation closes it AFTER this replacement opens, so its slot is effectively already
 * free — exclude it from the count so the rotation reuses that slot instead of force-closing an
 * unrelated hot DM. Omitted / not-open → today's behavior (evict when genuinely over budget).
 */
export async function evictLruDmIfNeeded(
  plugin: SpecoratorPlugin,
  manager: DmEvictionManager,
  recency: readonly string[],
  openingConversationId: string,
  displacedConversationId?: string | null,
): Promise<boolean> {
  const tabs = manager.getAllTabs?.() ?? [];
  const displacedOpen = displacedConversationId != null && tabs.some((tab) => tab.conversationId === displacedConversationId);
  const effectiveCount = tabs.length - (displacedOpen ? 1 : 0);
  if (effectiveCount < resolveMaxTeamChatDms(plugin.settings)) return true;
  const victimTabId = pickLruDmEviction(tabs, recency, manager.getActiveTabId?.() ?? null, openingConversationId);
  if (victimTabId == null) return false;
  // A successful eviction close frees exactly the one slot the new DM needs (the budget is
  // enforced on every open, so the manager is at most one over). Propagate the close result:
  // a rare failed close freed nothing, so the caller must not then bypass the cap.
  return closeTeamChatDmTab(plugin, manager, victimTabId);
}
