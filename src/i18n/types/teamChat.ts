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
  | 'teamChat.providerRotated';
