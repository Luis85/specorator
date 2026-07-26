import type SpecoratorPlugin from '../../main';
import { tabCountsPayload } from '../chat/events';
import type { TabData } from '../chat/tabs/types';
import { refreshDmAgentPersonas } from './teamChatDmRefresh';

/**
 * The post-restore publish step: everything that must happen, in order, once a leaf's DM
 * tabs have been restored. Lifted out of `TeamChatView` because the ORDER is the whole
 * contract and it reads better as one narrated sequence than as a `finally` block inside
 * the restore's error handling.
 *
 * The caller still owns the manager-identity guard (only the CURRENT manager's restore may
 * publish — a superseded restore reaching here would re-open the capacity gate and re-emit
 * while a newer restore is mid-flight).
 */
export interface RestoreCompletionHost {
  /** Re-derive `selectedAgentId` from the now-active tab, then emit. */
  projectSelectedAgent(): void;
  /** Flip the capacity gate open (`tabsRestored`). */
  markRestored(): void;
  getAllTabs(): TabData[];
  /** The restored manager, for the capacity broadcast's counts. */
  tabCounts(): { getTabCount(): number; countTabsByKind(kind: 'chat' | 'work-order'): number } | null;
  /** Re-reconcile restored DMs against their agent's CURRENT provider. */
  reconcileRestoredProviders(): Promise<void>;
  /** Take (and clear) a roster click queued while restoring. */
  takePendingSelection(): string | null;
  openAgentDm(agentId: string): void;
}

export async function completeTeamChatRestore(
  plugin: SpecoratorPlugin,
  host: RestoreCompletionHost,
): Promise<void> {
  // Project the active DM's agent — or null when nothing restored, clearing the stale hint.
  host.projectSelectedAgent();
  host.markRestored();
  // Capacity is readable again now that the gate is open (`getTabSlotUsage` reported FULL
  // while it was closed). Mirror SpecoratorView: fire chat:tabs-changed once so the Agent
  // Board work-order queue re-ticks and drains any runnable card, instead of stalling until
  // an unrelated tab change nudges it.
  plugin.events.emit('chat:tabs-changed', tabCountsPayload(host.tabCounts()));
  // Round-42: no startup event reconciles a deferred/closed-leaf restore against the agent's
  // CURRENT provider. AFTER the gate opens, so selectAgent's restore gate is open; its
  // generation + manager-identity guards drop a superseded rebuild.
  await host.reconcileRestoredProviders();
  // Seed transcript attribution for every restored DM: a reload rebuilds the tabs but no
  // roster event follows, so without this a restored DM renders anonymously until the next
  // roster edit.
  await refreshDmAgentPersonas(plugin, host.getAllTabs());
  // Drain a roster click queued while restoring (Round-48 Fix C) through openAgentDm, so a
  // rejecting drained open is caught+logged rather than unhandled; its own guards supersede
  // it if stale.
  const pending = host.takePendingSelection();
  if (pending) host.openAgentDm(pending);
}
