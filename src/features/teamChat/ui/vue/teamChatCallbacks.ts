import type { ComposerEditedFile } from '../../../chat/ui/vue/composer/stores/composerStore';
import type { TeamChatPresence } from '../../teamChatPresence';
import type { TeamChatThreadMeta } from '../../teamChatThreadMeta';

/**
 * Vue → engine seam for the Team Chat island (mirror of chat's
 * `ChatShellCallbacks`). `subscribe` fans the view's projected snapshot into the
 * Pinia store (see `useTeamChatEventRouting`); `onSelectAgent` is the roster's
 * DM-open delegator — a row click resolves and opens the agent's persistent DM
 * through `TeamChatView.selectAgent`; `onOpenEditedFile` opens a file from the
 * top bar's edited-files strip through the view (reusing chat's `openEditedFile`).
 */

/** Projected read-model the view pushes to store observers on every change. */
export interface TeamChatSnapshot {
  /** Agent whose DM is the active thread, or null when none is selected. */
  selectedAgentId: string | null;
  /** The active DM tab's created/edited files (empty when none / no active DM). */
  editedFiles: ComposerEditedFile[];
  /** The active DM's bound provider id, or null when no DM is active — the top bar
   *  resolves it to a display-name chip so a failing/unavailable backend is visible. */
  activeProviderId: string | null;
  /** Live roster presence: only the currently-busy agents (absent = idle). */
  presence: Record<string, TeamChatPresence>;
  /** The active DM's model id, or null when unknown — rendered beside the provider
   *  chip. Null (not a placeholder) when the provider can't name a model, so the
   *  chip hides rather than showing a hollow slot. */
  activeModelLabel: string | null;
  /** Per-agent DM projection (preview + last activity) for the roster rows. Agents
   *  with no resolved/loaded thread are absent, which the rail renders as the
   *  agent's description. */
  threads: Record<string, TeamChatThreadMeta>;
  /** Agents whose DM moved since this leaf last showed it (absent = read). Sparse,
   *  like `presence`. Per-leaf and in-memory — never persisted (design §1.3). */
  unread: Record<string, true>;
  /** True while an active DM has no messages yet — drives the conversation-starter
   *  row. False (not true) when there is no active DM at all, so the starters never
   *  render over the no-DM-selected empty pane. */
  activeDmIsEmpty: boolean;
}

export type TeamChatSubscribe = (onChange: (snapshot: TeamChatSnapshot) => void) => () => void;

export interface TeamChatCallbacks {
  /** Register a store-reprojection observer; returns the unsubscribe fn. */
  subscribe: TeamChatSubscribe;
  /** Roster row → open or resume the agent's single persistent DM. */
  onSelectAgent(agentId: string): void;
  /** Top-bar edited-files row → open that file in the workspace. */
  onOpenEditedFile(path: string): void;
  /** Row / top-bar menu → open this agent in the Library's Agents tab. */
  onEditAgent(agentId: string): void;
  /**
   * Row / top-bar menu → close this agent's open DM tab, freeing an LRU slot. The
   * thread MAPPING survives, so reselecting the agent reopens the same transcript;
   * this is a "close the window", never a delete. A no-op when the DM isn't open.
   */
  onCloseDm(agentId: string): void;
  /**
   * Empty-state conversation starter → put this text in the active DM's composer
   * WITHOUT sending. A starter that dispatched a turn on one click would spend a
   * provider call the user only meant to preview (design §3.2).
   */
  onFillComposer(text: string): void;
  /**
   * The leaf's persisted rail geometry, read ONCE during setup to seed the store.
   * Deliberately a plain getter rather than a `TeamChatSnapshot` field: rail geometry
   * is written by the island and read by the host — routing it through the snapshot
   * would both churn it on every stream frame and create a write-loop with the rail's
   * own drag state.
   */
  getRailGeometry(): TeamChatRailGeometry;
  /** Rail collapsed/resized in the island → persist per leaf (debounced by the host). */
  onRailGeometryChange(geometry: TeamChatRailGeometry): void;
}

/** Roster rail chrome, persisted per leaf alongside the DM layout. */
export interface TeamChatRailGeometry {
  collapsed: boolean;
  /** Expanded width in px; retained while collapsed so expanding restores it. */
  width: number;
}
