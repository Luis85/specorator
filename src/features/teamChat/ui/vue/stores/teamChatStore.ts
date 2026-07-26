import { defineStore } from 'pinia';
import { shallowRef } from 'vue';

import type { RosterAgent } from '../../../../agents/roster/rosterTypes';
import type { ComposerEditedFile } from '../../../../chat/ui/vue/composer/stores/composerStore';
import type { TeamChatPresence } from '../../../teamChatPresence';

/**
 * Reactive read-model for one Team Chat leaf: the roster projection, the
 * selected-agent slice (row highlight + right-pane empty state), and the active
 * DM's edited-files + bound-provider projections the top bar renders. Truth stays
 * in `plugin.agentRosterStore` + the tab engine; the setters replace the whole
 * value (`shallowRef`, no deep-proxy) so a change fires the watch cheaply.
 * `selectedAgentId` is a pure projection of the view's selection — the view owns
 * it and pushes it (with `editedFiles` + `activeProviderId`) through
 * `useTeamChatEventRouting`. `activeProviderId` is the active DM's backend id, which
 * the top bar resolves to a display-name chip so a DM on an unavailable/failing
 * provider still shows which backend it runs on. No separate `activeThread` slice:
 * the top bar resolves the active agent object from `agents` + `selectedAgentId`, so
 * the fallow ratchet's no-unused-member rule keeps the store to the two identity
 * fields plus the two active-DM projections — each wired through to render.
 *
 * `presence` is the roster's live idle/busy map, projected off the tab engine's
 * streaming callbacks (see `projectTeamChatPresence`); it only carries the
 * currently-busy agents, so `PresenceDot` reads `presence[id] ?? 'idle'`.
 */
export const useTeamChatStore = defineStore('team-chat', () => {
  const agents = shallowRef<RosterAgent[]>([]);
  const selectedAgentId = shallowRef<string | null>(null);
  const editedFiles = shallowRef<ComposerEditedFile[]>([]);
  const activeProviderId = shallowRef<string | null>(null);
  const presence = shallowRef<Record<string, TeamChatPresence>>({});

  function setAgents(next: RosterAgent[]): void {
    agents.value = next;
  }

  function setSelected(next: string | null): void {
    selectedAgentId.value = next;
  }

  function setEditedFiles(next: ComposerEditedFile[]): void {
    editedFiles.value = next;
  }

  function setActiveProviderId(next: string | null): void {
    activeProviderId.value = next;
  }

  function setPresence(next: Record<string, TeamChatPresence>): void {
    presence.value = next;
  }

  return {
    agents,
    selectedAgentId,
    editedFiles,
    activeProviderId,
    presence,
    setAgents,
    setSelected,
    setEditedFiles,
    setActiveProviderId,
    setPresence,
  };
});
