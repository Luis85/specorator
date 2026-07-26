export type TeamChatTranslationKey =
  // Team Chat main-area view (features/teamChat)
  | 'teamChat.viewTitle'
  | 'teamChat.emptyState'
  | 'teamChat.rosterEmpty'
  // Empty-roster CTA: deep-links the Marketplace's Agents category (first-run bridge)
  | 'teamChat.rosterEmptyCta'
  | 'teamChat.tabCapReached'
  // Roster presence dots (idle / busy)
  | 'teamChat.presenceIdle'
  | 'teamChat.presenceBusy'
  // Provider-change rotation notice (a fresh thread was started on the new provider)
  | 'teamChat.providerRotated'
  // A provider change force-closed a mid-stream DM, truncating the in-flight response
  | 'teamChat.rotationInterrupted'
  // Bound agent deleted from the roster: the open DM is read-only until a new agent is picked
  | 'teamChat.agentRemoved'
  // Roster read failed (vault I/O) during the DM send guard: the send is blocked fail-safe and
  // the reserved composer restored, so the user can retry once the transient glitch clears
  | 'teamChat.agentVerifyFailed'
  // A reused-island action (fork / clear / new-session) that a DM's one-fixed-thread model disallows
  | 'teamChat.actionUnavailableInDm'
  // --- Roster rail: search + sort (compact toolbar; shown once the roster passes
  // ROSTER_SEARCH_MIN_AGENTS, below which a search field over a few rows is noise) ---
  | 'teamChat.rosterSearchPlaceholder'
  | 'teamChat.rosterSortLabel'
  // `recent` is Team-Chat-only (DM activity order); name/updated mirror the shared LibrarySort
  | 'teamChat.rosterSortRecent'
  | 'teamChat.rosterSortName'
  | 'teamChat.rosterSortUpdated'
  | 'teamChat.rosterNoMatches'
  // Roster row: a DM answered while the user was reading another thread (per-leaf, in-memory)
  | 'teamChat.presenceUnread'
  // --- Row / top-bar overflow menus ---
  | 'teamChat.rowActions'
  | 'teamChat.topBarActions'
  | 'teamChat.menuOpenChat'
  | 'teamChat.menuEditAgent'
  | 'teamChat.menuCloseChat'
  // --- Rail collapse / resize (per-leaf view state) ---
  | 'teamChat.railCollapse'
  | 'teamChat.railExpand'
  | 'teamChat.railResize'
  // --- Empty states: no DM selected (quick-picks) and an open DM with no history ---
  | 'teamChat.emptyHeadline'
  | 'teamChat.emptyQuickPicks'
  | 'teamChat.dmGreetingTitle'
  | 'teamChat.dmGreetingBody'
  | 'teamChat.startersLabel'
  | 'teamChat.starterExplain'
  | 'teamChat.starterPlan'
  | 'teamChat.starterReview'
  // --- Relative DM activity timestamps (coarse buckets; absolute time rides `title`) ---
  | 'teamChat.timeNow'
  | 'teamChat.timeMinutes'
  | 'teamChat.timeHours'
  | 'teamChat.timeDays';
