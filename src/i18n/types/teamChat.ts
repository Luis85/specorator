export type TeamChatTranslationKey =
  // Team Chat main-area view (features/teamChat)
  | 'teamChat.viewTitle'
  | 'teamChat.emptyState'
  | 'teamChat.rosterEmpty'
  | 'teamChat.tabCapReached'
  // Roster presence dots (idle / busy)
  | 'teamChat.presenceIdle'
  | 'teamChat.presenceBusy'
  // Provider-change rotation notice (a fresh thread was started on the new provider)
  | 'teamChat.providerRotated'
  // Bound agent deleted from the roster: the open DM is read-only until a new agent is picked
  | 'teamChat.agentRemoved'
  // A reused-island action (fork / clear / new-session) that a DM's one-fixed-thread model disallows
  | 'teamChat.actionUnavailableInDm';
