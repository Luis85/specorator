import { computed, type ComputedRef } from 'vue';

import type { RosterAgent } from '../../../agents/roster/rosterTypes';
import { useTeamChatStore } from './stores/teamChatStore';

/**
 * The roster agent whose DM is currently in the pane, resolved from `agents` +
 * `selectedAgentId`.
 *
 * There is deliberately no `activeAgent` slice in the store: `selectedAgentId` is a pure
 * projection of the active tab, so deriving the object here keeps ONE source of truth and
 * lets the fallow ratchet's no-unused-member rule hold the store to fields that actually
 * render. Shared by the top bar and the starters card, which both need it.
 *
 * `undefined` when no DM is active, or when the bound agent has left the roster — both are
 * states where the surfaces self-hide rather than render a name that no longer resolves.
 */
export function useActiveAgent(): ComputedRef<RosterAgent | undefined> {
  const store = useTeamChatStore();
  return computed(() =>
    (store.selectedAgentId
      ? store.agents.find((agent) => agent.id === store.selectedAgentId)
      : undefined));
}
