import type { ComposerEditedFile } from '../../../chat/ui/vue/composer/stores/composerStore';
import type { TeamChatPresence } from '../../teamChatPresence';

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
}

export type TeamChatSubscribe = (onChange: (snapshot: TeamChatSnapshot) => void) => () => void;

export interface TeamChatCallbacks {
  /** Register a store-reprojection observer; returns the unsubscribe fn. */
  subscribe: TeamChatSubscribe;
  /** Roster row → open or resume the agent's single persistent DM. */
  onSelectAgent(agentId: string): void;
  /** Top-bar edited-files row → open that file in the workspace. */
  onOpenEditedFile(path: string): void;
}
