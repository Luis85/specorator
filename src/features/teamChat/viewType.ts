import type { AppTabManagerState } from '../../core/providers/types';

export const VIEW_TYPE_TEAM_CHAT = 'specorator-team-chat';

/**
 * Leaf-owned persisted state (T5): Team Chat never writes the global
 * `persistTabManagerState()` slot — its DM layout round-trips through Obsidian
 * view state so two Team Chat leaves can't clobber each other (or the sidebar's
 * fallback). `selectedAgentId` seeds the DM to reopen on restore (4b).
 */
export interface TeamChatViewState {
  selectedAgentId?: string;
  tabManagerState?: AppTabManagerState;
}
