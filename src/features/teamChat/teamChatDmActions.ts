import type SpecoratorPlugin from '../../main';
import type { TabData } from '../chat/tabs/types';
import { closeTeamChatDmTab } from './teamChatDmTabs';
import { MAX_RAIL_WIDTH, MIN_RAIL_WIDTH } from './ui/vue/stores/teamChatStore';

/**
 * The Vue→engine ACTIONS the Team Chat island fires (row/top-bar menus, empty-state
 * starters, rail geometry), kept out of `TeamChatView` for the same reason the refresh
 * loops and the tab mechanics are: the view is a host, not a behavior bag, and it sits
 * under a LOC ceiling. Each function takes exactly what it needs, so they are unit-testable
 * without instantiating a leaf.
 */

/**
 * Closes an agent's open DM tab (row / top-bar menu), freeing an LRU slot. The thread
 * MAPPING is untouched, so reselecting the agent reopens the same transcript — this is
 * "close the window", never a delete.
 *
 * Resolves the owning tab ACROSS LEAVES, not just in the clicking leaf's own manager: the
 * open coordinator deliberately single-mounts each DM and reveals it wherever it already
 * lives, so the row you are clicking in leaf A may well be mounted in leaf B — a same-leaf
 * lookup silently no-ops there. Same `findConversationAcrossViews` resolution the rotation
 * close path uses.
 *
 * Refuses while that DM is streaming, matching `pickLruDmEviction`'s refusal to force-close
 * a live turn. The pre-check is only an optimization; the guarantee is the NON-FORCED close,
 * which re-checks `isStreaming` inside the owning manager's serialized mutation.
 *
 * Returns whether a tab was actually closed. "Not mapped", "not open anywhere", and "refused
 * because busy" all report false — deliberately not distinguished, since none of the three
 * has a different user-facing outcome.
 */
export async function closeAgentDmTab(
  plugin: SpecoratorPlugin,
  agentId: string,
): Promise<boolean> {
  const conversationId = await plugin.getTeamChatThreadStore().get(agentId);
  if (!conversationId) return false;
  const owner = plugin.findConversationAcrossViews(conversationId);
  const manager = owner?.view.getTabManager();
  if (!owner || !manager) return false;
  const tab = manager.getAllTabs().find((candidate) => candidate.conversationId === conversationId);
  if (tab?.state.isStreaming) return false;
  return closeTeamChatDmTab(plugin, manager, owner.tabId, false);
}

/**
 * Drops an empty-state conversation starter into a DM's composer WITHOUT sending (design
 * §3.2 — a one-click send would spend a provider call the user only meant to preview).
 *
 * Writes to the textarea and dispatches a bubbling `input`, which is exactly what typing
 * does: the composer island's own listeners re-project off that event, so autosize, the
 * send-enable state, and the draft bookkeeping all recompute through their normal path
 * rather than being poked individually.
 */
export function fillComposer(tab: TabData | null, text: string): void {
  if (!tab) return;
  tab.dom.inputEl.value = text;
  tab.dom.inputEl.dispatchEvent(new Event('input', { bubbles: true }));
  tab.dom.inputEl.focus();
}

/**
 * Reads the `agentId → conversationId` map backing the roster's preview/timestamp
 * projection, or null when the read fails.
 *
 * Null-on-failure (rather than an empty map) is load-bearing: the caller keeps its previous
 * map, so one transient vault glitch leaves rows on slightly stale previews instead of
 * blanking every row's subtitle.
 */
export async function readAgentThreads(
  plugin: SpecoratorPlugin,
): Promise<Record<string, string> | null> {
  try {
    return await plugin.getTeamChatThreadStore().listAgentThreads();
  } catch (error) {
    plugin.logger.scope('team-chat').error('thread map read failed', error);
    return null;
  }
}

/** Shared clamp for every rail width reaching the host — the island's drag and a restored
 *  (possibly hand-edited or sync-mangled) view state. Mirrors the store's own setter so the
 *  two can't disagree about the bounds. */
export function clampRailWidth(width: number): number {
  return Math.min(MAX_RAIL_WIDTH, Math.max(MIN_RAIL_WIDTH, Math.round(width)));
}
