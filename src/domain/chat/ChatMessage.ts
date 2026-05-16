/**
 * Plain DTO for a single turn in a chat thread (IDEA-ASV-001, Increment 2 of
 * agent-sidepanel-v2). Stored in the Pinia `chatStore` under the
 * `messages: Map<threadId, ChatMessage[]>` field and rendered by
 * `MessageList.vue`.
 *
 * This shape is deliberately UI-scoped: it is NOT the persistence schema for
 * the session log (that lives in `src/application/chat/SessionLog.ts` and
 * mirrors the audit trail to the vault). The store-side message log is
 * memory-only — survival across Obsidian restarts is provided by the
 * `chatThreads` plugin-data blob plus the vault session log re-readable by
 * subscription transports via `--resume <session_id>`.
 *
 * Roles:
 *   - `'user'`     — message the user submitted via `ChatInput`
 *   - `'assistant'`— text reply returned by the model (free-text path) OR an
 *                    empty body when the turn produced a `FileWriteProposal`
 *                    (the proposal card is rendered separately).
 */
export interface ChatMessage {
	/** Stable identifier used as `:key` in lists. UUID v4 from `crypto.randomUUID()`. */
	readonly id: string;
	/** Thread this message belongs to. Matches a key in `chatStore.chatThreads`. */
	readonly threadId: string;
	/** Author of the message. */
	readonly role: 'user' | 'assistant';
	/** Message body. Plain text today; future increments may add structured blocks. */
	readonly text: string;
	/** ISO 8601 UTC timestamp recorded at append time. */
	readonly createdAt: string;
	/**
	 * Set on the assistant message when `buildPrompt()` had to trim context to
	 * stay within the cap (REQ-CCS-013 trimmed-success branch). Drives the
	 * "Some context was trimmed" notice rendered inline in `MessageList.vue`.
	 */
	readonly truncated?: boolean;
}
