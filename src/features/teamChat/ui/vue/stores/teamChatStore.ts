import { defineStore } from 'pinia';
import { shallowRef } from 'vue';

import type { RosterAgent } from '../../../../agents/roster/rosterTypes';

/**
 * Reactive read-model for one Team Chat leaf: the roster projection plus the
 * selected-agent slice the read-only roster reads. Truth stays in
 * `plugin.agentRosterStore` + the tab engine; the setter replaces the whole
 * value (`shallowRef`, no deep-proxy) so a change fires the watch cheaply.
 *
 * Phase 4b adds the presence slice + `setSelected`/`activeThread` when it wires
 * roster-click and live presence dots. 4a keeps the store to exactly what the
 * read-only roster consumes — the quality ratchet forbids shipping members no
 * consumer references yet.
 */
export const useTeamChatStore = defineStore('team-chat', () => {
  const agents = shallowRef<RosterAgent[]>([]);
  const selectedAgentId = shallowRef<string | null>(null);

  function setAgents(next: RosterAgent[]): void {
    agents.value = next;
  }

  return { agents, selectedAgentId, setAgents };
});
