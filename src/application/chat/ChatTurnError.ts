/**
 * Typed error union for `ChatTurnOrchestrator.sendTurn()` failure modes.
 *
 * Returned via `Result.error` (ADR-004) so the UI does not need to
 * `try/catch`. Each `code` maps 1:1 to a deterministic UI branch:
 *
 *   - `cli-unavailable`       — port was not injected (standalone bootstrap),
 *                               or `isAvailable()` returned false at send time.
 *   - `not-implemented`       — orchestrator skeleton; retained for tests.
 *
 * Future codes (deferred to follow-ups): `aborted`, `stream-broken`. Today the
 * orchestrator translates these into `messagesStore.setError('query_failed' |
 * 'timeout')` and resolves with `ok({ kind: 'error', ... })` so the UI does
 * not lose the existing UX. Treat this union as additive.
 */
export type ChatTurnErrorCode = 'cli-unavailable' | 'not-implemented';

export class ChatTurnError extends Error {
	public readonly name = 'ChatTurnError';

	constructor(
		public readonly code: ChatTurnErrorCode,
		message?: string,
	) {
		super(message ?? code);
		Object.setPrototypeOf(this, new.target.prototype);
	}
}
