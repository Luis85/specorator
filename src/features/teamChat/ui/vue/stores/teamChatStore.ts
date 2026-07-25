import { defineStore } from 'pinia';
import { shallowRef } from 'vue';

import type { RosterAgent } from '../../../../agents/roster/rosterTypes';

/** Per-agent liveness placeholder; Phase 4b projects real streaming state. */
export type TeamChatPresence = 'idle' | 'busy';

/**
 * Reactive read-model for one Team Chat leaf: the roster projection plus the
 * selected-agent and presence slices the DM surface reads. Truth stays in
 * `plugin.agentRosterStore` + the tab engine; every setter replaces the whole
 * value (`shallowRef`, no deep-proxy) so a change fires the watch cheaply.
 */
export const useTeamChatStore = defineStore('team-chat', () => {
  const agents = shallowRef<RosterAgent[]>([]);
  const selectedAgentId = shallowRef<string | null>(null);
  const presence = shallowRef<Record<string, TeamChatPresence>>({});

  function setAgents(next: RosterAgent[]): void {
    agents.value = next;
  }
  function setSelected(id: string | null): void {
    selectedAgentId.value = id;
  }
  function setPresence(next: Record<string, TeamChatPresence>): void {
    presence.value = next;
  }

  return { agents, selectedAgentId, presence, setAgents, setSelected, setPresence };
});
