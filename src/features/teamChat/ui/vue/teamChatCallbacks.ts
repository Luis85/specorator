/**
 * Vue → engine seam for the Team Chat island (mirror of chat's
 * `ChatShellCallbacks`). `subscribe` fans the view's projected snapshot into the
 * Pinia store (see `useTeamChatEventRouting`); `onSelectAgent` is the roster's
 * DM-open delegator — a row click resolves and opens the agent's persistent DM
 * through `TeamChatView.selectAgent`.
 */

/** Projected read-model the view pushes to store observers on every change. */
export interface TeamChatSnapshot {
  /** Agent whose DM is the active thread, or null when none is selected. */
  selectedAgentId: string | null;
}

export type TeamChatSubscribe = (onChange: (snapshot: TeamChatSnapshot) => void) => () => void;

export interface TeamChatCallbacks {
  /** Register a store-reprojection observer; returns the unsubscribe fn. */
  subscribe: TeamChatSubscribe;
  /** Roster row → open or resume the agent's single persistent DM. */
  onSelectAgent(agentId: string): void;
}
