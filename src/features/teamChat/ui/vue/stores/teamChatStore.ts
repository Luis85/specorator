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
/** Hard ceiling. The EFFECTIVE ceiling is narrower on a small leaf — see `fitRailWidth`. */
export const MAX_RAIL_WIDTH = 420;
export const DEFAULT_RAIL_WIDTH = 260;
/** Icon-rail track: a 32px avatar plus the row's padding, and nothing else. */
export const COLLAPSED_RAIL_WIDTH = 56;
/** Narrowest transcript an expanded rail may leave beside itself. Below this the manual
 *  narrow-override is dropped: a pane that keeps shrinking past the point where the chat is
 *  still readable has to get the icon rail back, whatever the user asked for at a wider size. */
export const MIN_TRANSCRIPT_WIDTH = 320;

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
  const activeModelLabel = shallowRef<string | null>(null);
  const threads = shallowRef<Record<string, TeamChatThreadMeta>>({});
  const unread = shallowRef<Record<string, true>>({});
  const activeDmIsEmpty = shallowRef(false);
  /** Rail collapse/width live here rather than in view state directly: the rail
   *  writes them and the root reads them for its grid template, so they need a
   *  shared reactive home. The view persists them (per leaf) off the same values. */
  const railCollapsed = shallowRef(false);
  /** The width the USER chose, kept separately from the width actually rendered. Overwriting
   *  one with the other made the fit LOSSY: a 420px rail squeezed by a 721px leaf became 401px
   *  permanently, so widening the leaf again could never restore the preference. */
  const preferredRailWidth = shallowRef(DEFAULT_RAIL_WIDTH);
  /** Layout state, NOT a preference: true while the leaf is too narrow for the full rail.
   *  Kept separate from `railCollapsed` so widening restores exactly what the user chose,
   *  and deliberately NOT exposed — consumers read the derived `railIsCollapsed`, so no
   *  component can accidentally branch on the preference alone (which is the bug this
   *  derivation exists to prevent). Written only through `setRailNarrow`. */
  const railNarrow = shallowRef(false);
  /** True while the user has explicitly expanded a narrow-FORCED rail. Layout state, never
   *  persisted, and cleared on any crossing of the narrow threshold so the width-driven
   *  default re-asserts itself on the next resize. Without it the toggle was dead on a narrow
   *  leaf: it wrote a preference that `railNarrow` then overrode, so the button labelled
   *  "Expand" did nothing and the rail's search + row menus stayed unreachable (Round-68). */
  const railNarrowOverride = shallowRef(false);
  /** Last width the leaf actually measured, so a rail-width change can be judged against it
   *  without waiting for a `ResizeObserver` callback that a separator drag never triggers. */
  const lastLeafWidth = shallowRef(0);
  /** The EFFECTIVE collapsed state — the one every consumer must render against. Derived in
   *  the store rather than per-component because the root sizes the grid track from it while
   *  the roster decides what to render; when those two disagreed, a narrow leaf rendered
   *  expanded rows clipped inside a 56px track. */
  const railIsCollapsed = computed(() =>
    railCollapsed.value || (railNarrow.value && !railNarrowOverride.value));
  /** The width to RENDER: the preference, re-fitted to whatever the leaf can currently afford.
   *  Derived rather than assigned, so every fit is reversible — shrink the leaf and the rail
   *  narrows, widen it and the user's own width comes back. */
  const railWidth = computed(() => fitRailWidth(preferredRailWidth.value));

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

  function setActiveModelLabel(next: string | null): void {
    activeModelLabel.value = next;
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

  function setRailNarrow(next: boolean, leafWidth = 0): void {
    if (leafWidth > 0) lastLeafWidth.value = leafWidth; // `railWidth` re-derives off this
    if (railNarrow.value !== next) {
      railNarrow.value = next;
      railNarrowOverride.value = false; // a threshold crossing re-asserts the width-driven default
      return;
    }
    dropOverrideIfCramped();
  }

  /**
   * Drops a manual expand-override once the rail stops leaving a usable transcript beside it.
   * Reachable TWO ways, which is why it is not inlined in the resize path: the LEAF shrinking
   * (`ResizeObserver`) and the RAIL growing (a separator drag). The second fires no
   * `ResizeObserver` at all — the root's own width never changes — so an override taken at
   * 700px could be dragged into a 420px rail beside a 280px transcript with nothing noticing.
   */
  function dropOverrideIfCramped(): void {
    if (!railNarrow.value || !railNarrowOverride.value || lastLeafWidth.value <= 0) return;
    if (lastLeafWidth.value - railWidth.value < MIN_TRANSCRIPT_WIDTH) railNarrowOverride.value = false;
  }

  function setRailCollapsed(next: boolean): void {
    railCollapsed.value = next;
  }

  /**
   * Flips the EFFECTIVE collapsed state and returns the preference to persist. Lives here, not
   * in the rail, because expanding has to clear BOTH gates: on a narrow leaf `railNarrow`
   * forces the icon rail whatever the preference says, so writing the preference alone leaves
   * the rail collapsed — the "Expand" button doing nothing at all.
   */
  function toggleRail(): boolean {
    const expanding = railIsCollapsed.value;
    railCollapsed.value = !expanding;
    railNarrowOverride.value = expanding && railNarrow.value;
    return railCollapsed.value;
  }

  /** Records the user's PREFERENCE, bounded only by the hard rail limits. The leaf-relative
   *  fit happens in `railWidth`, so a squeeze never destroys what they picked. */
  function setRailWidth(next: number): void {
    preferredRailWidth.value = Math.min(MAX_RAIL_WIDTH, Math.max(MIN_RAIL_WIDTH, Math.round(next)));
    dropOverrideIfCramped(); // below the floor even a MINIMUM rail starves the chat: collapse instead
  }

  /**
   * The rail width this leaf can actually afford. `MAX_RAIL_WIDTH` alone was a HALF-SCREEN
   * ceiling, not a guarantee: a 721px leaf never trips `railNarrow`, so a 420px rail left the
   * transcript ~301px with nothing to catch it — the stated "keeps the transcript's reading
   * measure intact" was true only for wide leaves. The ceiling is therefore dynamic.
   *
   * `MIN_RAIL_WIDTH` still wins at the bottom: on a leaf too small for both, an expanded rail
   * is the wrong answer entirely, and `dropOverrideIfCramped` collapses it to the icon rail.
   */
  function fitRailWidth(width: number): number {
    const affordable = lastLeafWidth.value > 0
      ? Math.max(MIN_RAIL_WIDTH, lastLeafWidth.value - MIN_TRANSCRIPT_WIDTH)
      : MAX_RAIL_WIDTH;
    return Math.min(MAX_RAIL_WIDTH, affordable, Math.max(MIN_RAIL_WIDTH, width));
  }

  return {
    agents,
    selectedAgentId,
    editedFiles,
    activeProviderId,
    presence,
    activeModelLabel,
    threads,
    unread,
    activeDmIsEmpty,
    railCollapsed,
    railIsCollapsed,
    railWidth,
    preferredRailWidth,
    setAgents,
    setSelected,
    setEditedFiles,
    setActiveProviderId,
    setPresence,
    setActiveModelLabel,
    setThreads,
    setUnread,
    setActiveDmIsEmpty,
    setRailCollapsed,
    setRailNarrow,
    setRailWidth,
    toggleRail,
  };
});
