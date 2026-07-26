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

/** Minimal manager surface these actions need — satisfied by a concrete `TabManager`. */
interface DmTabSource {
  getAllTabs(): TabData[];
  closeTab(tabId: string, force?: boolean): Promise<boolean>;
}

/**
 * Closes an agent's open DM tab (row / top-bar menu), freeing an LRU slot. The thread
 * MAPPING is untouched, so reselecting the agent reopens the same transcript — this is
 * "close the window", never a delete.
 *
 * Refuses while that DM is streaming, matching `pickLruDmEviction`'s refusal to force-close
 * a live turn: the two must not disagree about whether truncating a running response is
 * acceptable. Both menus also hide the item in that state; the real backstop is the
 * NON-FORCED close, which re-checks streaming inside the serialized tab mutation.
 *
 * Returns whether a tab was actually closed, so a caller can distinguish "nothing open"
 * from "refused because busy" only by checking presence itself — deliberately not encoded
 * here, since neither case has a different user-facing outcome.
 */
export async function closeAgentDmTab(
  plugin: SpecoratorPlugin,
  manager: DmTabSource | null,
  agentId: string,
): Promise<boolean> {
  const tab = manager?.getAllTabs().find(
    (candidate) => candidate.conversationId
      && plugin.getConversationSync(candidate.conversationId)?.boundAgentId === agentId,
  );
  // The pre-check keeps the common case cheap, but it is NOT the guarantee: `force = false`
  // makes `closeTabImpl` re-check `isStreaming` inside the serialized tab mutation, so a turn
  // that starts while this close is queued still refuses.
  if (!manager || !tab || tab.state.isStreaming) return false;
  return closeTeamChatDmTab(plugin, manager, tab.id, false);
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
