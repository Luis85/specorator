import { defineStore } from 'pinia';
import { computed, shallowRef } from 'vue';

import type { RosterAgent } from '../../../../agents/roster/rosterTypes';
import type { ComposerEditedFile } from '../../../../chat/ui/vue/composer/stores/composerStore';
import type { TeamChatPresence } from '../../../teamChatPresence';
import type { TeamChatThreadMeta } from '../../../teamChatThreadMeta';

/** Rail sizing bounds (design §1.6). The floor keeps a name legible beside the
 *  32px avatar; the ceiling keeps the transcript's reading measure intact on a
 *  half-screen leaf. Collapsed is a separate mode, not `width = 0`. */
export const MIN_RAIL_WIDTH = 200;
export const MAX_RAIL_WIDTH = 420;
export const DEFAULT_RAIL_WIDTH = 260;
/** Icon-rail track: a 32px avatar plus the row's padding, and nothing else. */
export const COLLAPSED_RAIL_WIDTH = 56;

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
  const activeModelId = shallowRef<string | null>(null);
  const threads = shallowRef<Record<string, TeamChatThreadMeta>>({});
  const unread = shallowRef<Record<string, true>>({});
  const activeDmIsEmpty = shallowRef(false);
  /** Rail collapse/width live here rather than in view state directly: the rail
   *  writes them and the root reads them for its grid template, so they need a
   *  shared reactive home. The view persists them (per leaf) off the same values. */
  const railCollapsed = shallowRef(false);
  const railWidth = shallowRef(DEFAULT_RAIL_WIDTH);
  /** Layout state, NOT a preference: true while the leaf is too narrow for the full rail.
   *  Kept separate from `railCollapsed` so widening restores exactly what the user chose,
   *  and deliberately NOT exposed — consumers read the derived `railIsCollapsed`, so no
   *  component can accidentally branch on the preference alone (which is the bug this
   *  derivation exists to prevent). Written only through `setRailNarrow`. */
  const railNarrow = shallowRef(false);
  /** The EFFECTIVE collapsed state — the one every consumer must render against. Derived in
   *  the store rather than per-component because the root sizes the grid track from it while
   *  the roster decides what to render; when those two disagreed, a narrow leaf rendered
   *  expanded rows clipped inside a 56px track. */
  const railIsCollapsed = computed(() => railCollapsed.value || railNarrow.value);

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

  function setActiveModelId(next: string | null): void {
    activeModelId.value = next;
  }

  function setThreads(next: Record<string, TeamChatThreadMeta>): void {
    threads.value = next;
  }

  function setUnread(next: Record<string, true>): void {
    unread.value = next;
  }

  function setActiveDmIsEmpty(next: boolean): void {
    activeDmIsEmpty.value = next;
  }

  function setRailNarrow(next: boolean): void {
    railNarrow.value = next;
  }

  function setRailCollapsed(next: boolean): void {
    railCollapsed.value = next;
  }

  /** Clamped on the way in so neither a restored view state nor a drag can persist a
   *  width that hides the rail or starves the transcript. */
  function setRailWidth(next: number): void {
    railWidth.value = Math.min(MAX_RAIL_WIDTH, Math.max(MIN_RAIL_WIDTH, Math.round(next)));
  }

  return {
    agents,
    selectedAgentId,
    editedFiles,
    activeProviderId,
    presence,
    activeModelId,
    threads,
    unread,
    activeDmIsEmpty,
    railCollapsed,
    railIsCollapsed,
    railWidth,
    setAgents,
    setSelected,
    setEditedFiles,
    setActiveProviderId,
    setPresence,
    setActiveModelId,
    setThreads,
    setUnread,
    setActiveDmIsEmpty,
    setRailCollapsed,
    setRailNarrow,
    setRailWidth,
  };
});
