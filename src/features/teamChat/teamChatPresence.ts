/** A roster agent's live presence in Team Chat: `busy` while its DM streams. */
export type TeamChatPresence = 'idle' | 'busy';

/** Minimal open-tab shape the presence projection reads (satisfied by `TabData`:
 *  `conversationId` plus a `state` whose `isStreaming` getter is a boolean). */
export interface PresenceTabView {
  readonly conversationId: string | null;
  readonly state: { readonly isStreaming: boolean };
}

/**
 * Projects idle/busy presence over the open DM tabs: an agent is `busy` while its
 * bound DM tab is streaming, and absent otherwise — a reader defaults an absent
 * agent (one with no open DM, or one whose DM is idle) to `idle` via
 * `presence[id] ?? 'idle'`, so the map only ever carries the currently-busy
 * agents.
 *
 * A pure projection over live tab state, mirroring the view's
 * `selectedAgentId`/`editedFiles` projections: because `ChatState` flips
 * `state.isStreaming` before firing `onTabStreamingChanged`, recomputing on that
 * emit yields `busy` for a just-started turn and drops back to `idle` on stop or
 * on tab close (the closed tab is simply gone from the tab set) — no separate
 * presence map to keep in sync. Base idle/busy only; the finer thinking→streaming
 * split is out of increment 1 (spec §3).
 */
export function projectTeamChatPresence(
  tabs: readonly PresenceTabView[],
  resolveBoundAgentId: (conversationId: string) => string | null,
): Record<string, TeamChatPresence> {
  const presence: Record<string, TeamChatPresence> = {};
  for (const tab of tabs) {
    if (!tab.conversationId || !tab.state.isStreaming) continue;
    const agentId = resolveBoundAgentId(tab.conversationId);
    if (agentId) presence[agentId] = 'busy';
  }
  return presence;
}
