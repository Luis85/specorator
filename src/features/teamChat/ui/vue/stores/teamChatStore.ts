import { defineStore } from 'pinia';
import { shallowRef } from 'vue';

import type { RosterAgent } from '../../../../agents/roster/rosterTypes';

/**
 * Reactive read-model for one Team Chat leaf: the roster projection plus the
 * selected-agent slice the roster reads (row highlight + right-pane empty
 * state). Truth stays in `plugin.agentRosterStore` + the tab engine; the setters
 * replace the whole value (`shallowRef`, no deep-proxy) so a change fires the
 * watch cheaply. `selectedAgentId` is a pure projection of the view's selection
 * — the view owns it and pushes it through `useTeamChatEventRouting`.
 *
 * Later 4b tasks add the presence slice + an `activeThread` projection when the
 * top bar and presence dots need them; the quality ratchet forbids shipping
 * members no consumer references yet, so they land with their readers.
 */
export const useTeamChatStore = defineStore('team-chat', () => {
  const agents = shallowRef<RosterAgent[]>([]);
  const selectedAgentId = shallowRef<string | null>(null);

  function setAgents(next: RosterAgent[]): void {
    agents.value = next;
  }

  function setSelected(next: string | null): void {
    selectedAgentId.value = next;
  }

  return { agents, selectedAgentId, setAgents, setSelected };
});
