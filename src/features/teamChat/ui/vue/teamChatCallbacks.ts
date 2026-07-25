/**
 * Vue → engine seam for the Team Chat island (mirror of chat's
 * `ChatShellCallbacks`). In Phase 4a only `subscribe` exists: the
 * `ChatViewHandle` UI-refresh methods re-project through it. Phase 4b adds the
 * DM-open / roster-interaction delegators the interactive surface needs.
 */
export interface TeamChatCallbacks {
  /** Register a store-reprojection observer; returns the unsubscribe fn. */
  subscribe(onChange: () => void): () => void;
}
