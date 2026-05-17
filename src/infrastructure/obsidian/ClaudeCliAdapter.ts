import { query as sdkQuery } from '@anthropic-ai/claude-agent-sdk';
import { isAbsolute } from 'path';
import type {
	ClaudeCliPort,
	ClaudeCliQueryOptions,
	ClaudeCliStreamOptions,
	StreamDelta,
} from '@/domain/ports/ClaudeCliPort';
import { ClaudeCliError } from '@/domain/ports/ClaudeCliPort';
import type { Result } from '@/domain/shared/Result';
import { ok, err } from '@/domain/shared/Result';
import type { SessionId } from '@/domain/chat/SessionId';
import type { LoggerPort } from '@/domain/ports';
import {
	StreamDeltaReducer,
	type RawClaudeEvent,
	type RawStreamEventInner,
} from '@/application/chat/StreamDeltaReducer';

/**
 * Loosely-typed view of the SDK message union. Only the fields actually
 * translated to `RawClaudeEvent`s are listed — keeps the file decoupled
 * from the SDK's full `SDKMessage` shape so a version bump that adds new
 * variants doesn't break our build.
 */
interface SdkMessage {
	type?: string;
	subtype?: string;
	session_id?: unknown;
	event?: unknown;
	result?: unknown;
}

/**
 * Production implementation of ClaudeCliPort using @anthropic-ai/claude-agent-sdk.
 * Satisfies REQ-CCS-002, REQ-CCS-003, REQ-CCS-016, REQ-CCS-017, REQ-CCS-025,
 * NFR-CCS-003, NFR-CCS-005, NFR-CCS-007, SPEC-CCS-001 §5.
 */
export class ClaudeCliAdapter implements ClaudeCliPort {
	/** True only after startup() succeeds. Never set to true if API key is missing. */
	private _available = false;
	/** Indicates whether SDK has been initialized. */
	private _sdkReady = false;
	/**
	 * Sync accessor for the Anthropic API key. Injected by the plugin layer so
	 * `_apiKeyCache` (hydrated from `SecretStorePort` at `loadSettings()` time)
	 * stays the single source of truth — the SDK call sites must remain
	 * synchronous, so we cannot call the async `secretStorage.getSecret()` on
	 * each request.
	 */
	private readonly _getApiKey: () => string;
	/** Logger for internal diagnostics. Never logs the API key value. */
	private readonly _logger: LoggerPort;
	/** Binary resolver — injectable for testability (defaults to require.resolve). */
	private readonly _resolveCliPath: () => string;

	constructor(
		getApiKey: () => string,
		logger: LoggerPort,
		resolveCliPath?: () => string,
	) {
		this._getApiKey = getApiKey;
		this._logger = logger;
		this._resolveCliPath =
			resolveCliPath ??
			(() => {
				// require.resolve is the correct Node.js API for binary path resolution (REQ-CCS-025).
				// eslint-disable-next-line @typescript-eslint/no-require-imports
				return require.resolve('@anthropic-ai/claude-agent-sdk/bin/claude');
			});
	}

	/**
	 * Pre-warm the subprocess. Called from onload() before the first user interaction.
	 * Satisfies REQ-CCS-003, NFR-CCS-002, SPEC-CCS-001 §5.2.
	 */
	async startup(): Promise<void> {
		// Idempotency guard: shutdown() resets _sdkReady, so a post-shutdown re-start is allowed.
		if (this._sdkReady) return;

		const key = this._getApiKey().trim();

		// Step 1: Check for empty/whitespace key.
		if (!key) {
			this._logger.warn(
				'ClaudeCliAdapter.startup(): Anthropic API key is empty — adapter will not start',
			);
			this._available = false;
			return;
		}

		// Step 2: Set env key. The key value must not be logged.
		process.env.ANTHROPIC_API_KEY = key;

		// Step 3: Resolve binary path (REQ-CCS-025).
		let binaryPath: string;
		try {
			binaryPath = this._resolveCliPath();
		} catch (e: unknown) {
			this._logger.warn('ClaudeCliAdapter.startup(): binary not found — adapter will not start', {
				error: e,
			});
			this._available = false;
			return;
		}

		// Step 4: Verify binary path is absolute (REQ-CCS-025).
		if (!isAbsolute(binaryPath)) {
			this._logger.warn(
				'ClaudeCliAdapter.startup(): resolved binary path is not absolute — adapter will not start',
			);
			this._available = false;
			return;
		}

		// Step 5: Mark adapter ready. SDK query() uses process.env.ANTHROPIC_API_KEY at call time.
		this._sdkReady = true;
		this._available = true;
		this._logger.info('ClaudeCliAdapter.startup(): adapter ready');
	}

	/**
	 * Send a prompt to Claude via the SDK. Returns Result<string, ClaudeCliError>.
	 * Never throws. Now layered on top of `queryStream()` — collects every
	 * `text` delta into a single string so existing free-text call sites stay
	 * unchanged. The Codex P1 audit / NFR-CCS-003 timeout + abort behaviour
	 * is inherited from `queryStream()`.
	 *
	 * Satisfies REQ-CCS-013, REQ-CCS-016, NFR-CCS-003, SPEC-CCS-001 §5.3.
	 */
	async query(
		prompt: string,
		options?: ClaudeCliQueryOptions,
	): Promise<Result<string, ClaudeCliError>> {
		if (options?.maxTurns !== undefined && options.maxTurns > 1) {
			this._logger.warn('ClaudeCliAdapter.query(): maxTurns > 1 is clamped to 1 in v1');
		}
		const chunks: string[] = [];
		for await (const delta of this.queryStream(prompt, options)) {
			if (delta.type === 'text') {
				chunks.push(delta.text);
			} else if (delta.type === 'error') {
				return err(delta.error);
			} else if (delta.type === 'done') {
				return ok(chunks.join(''));
			}
		}
		// Iterator exhausted without `done` — treat as failure (mirrors the
		// original `_runSdkQuery` "No result message" behaviour).
		return err(new ClaudeCliError('QUERY_FAILED', 'No result message received from SDK'));
	}

	/**
	 * Returns true if the adapter is ready to accept queries.
	 * Satisfies REQ-CCS-018, REQ-CCS-019, REQ-CCS-022, SPEC-CCS-001 §5.4.
	 */
	async isAvailable(): Promise<boolean> {
		return this._available && this._getApiKey().trim() !== '';
	}

	/**
	 * Terminate the subprocess. Called from onunload() which is synchronous.
	 * Satisfies REQ-CCS-017, NFR-CCS-007, SPEC-CCS-001 §5.5.
	 */
	shutdown(): void {
		if (this._sdkReady) {
			this._logger.debug('ClaudeCliAdapter.shutdown(): shutting down adapter');
			this._sdkReady = false;
		}
		this._available = false;
	}

	/**
	 * Streaming variant of `query()` (IDEA-ASV-001 Increment 2, PR-ASV-2-sdk).
	 *
	 * Emits real per-token text deltas by consuming the Anthropic Agent SDK's
	 * `stream_event` messages (`includePartialMessages: true`). The SDK emits
	 * an async generator of `SDKMessage`:
	 *   - `system` (subtype `'init'`)            → captured `session_id` → `session-id` delta
	 *   - `stream_event` with `content_block_delta` carrying a `text_delta`
	 *                                           → `text` delta
	 *   - `result`                              → `done`
	 *
	 * The caller's `options.signal` is wired into the SDK's `abortController`;
	 * aborting mid-stream causes the generator to throw, which the catch
	 * branch maps to a `QUERY_FAILED` error delta. Timeout follows the same
	 * pattern as `query()`: a separate Promise rejects on the deadline and
	 * aborts the SDK controller, then the catch maps it to `TIMEOUT`.
	 *
	 * Never throws. Mid-flight errors are delivered as a terminal `error`
	 * delta; a successful turn emits a final `done`.
	 */
	queryStream(
		prompt: string,
		options?: ClaudeCliStreamOptions,
	): AsyncIterable<StreamDelta> {
		const pre = this._preflightStream(options);
		if (pre !== null) return ClaudeCliAdapter._singleDelta(pre);
		return this._runStream(prompt, options);
	}

	/**
	 * Single-yield iterable helper — wraps one `StreamDelta` into an
	 * `AsyncIterable` for the early-error paths in `queryStream`.
	 */
	private static _singleDelta(delta: StreamDelta): AsyncIterable<StreamDelta> {
		return (async function* (): AsyncGenerator<StreamDelta> {
			yield delta;
		})();
	}

	/**
	 * Synchronous pre-flight checks. Returns the terminal error delta to
	 * emit before any SDK call, or `null` if the dispatch is allowed.
	 */
	private _preflightStream(options: ClaudeCliStreamOptions | undefined): StreamDelta | null {
		if (!this._available) {
			return {
				type: 'error',
				error: new ClaudeCliError(this._unavailableCode(), 'ClaudeCliAdapter is not available'),
			};
		}
		const currentKey = this._getApiKey().trim();
		if (currentKey === '') {
			return { type: 'error', error: new ClaudeCliError('API_KEY_MISSING', 'API key is missing') };
		}
		process.env.ANTHROPIC_API_KEY = currentKey;
		if (options?.signal?.aborted === true) {
			return { type: 'error', error: new ClaudeCliError('QUERY_FAILED', 'Aborted before send') };
		}
		return null;
	}

	private async *_runStream(
		prompt: string,
		options?: ClaudeCliStreamOptions,
	): AsyncIterable<StreamDelta> {
		const timeoutMs = this._clampTimeout(options?.timeoutMs);
		const controller = new AbortController();
		const onAbort = (): void => {
			controller.abort();
		};
		options?.signal?.addEventListener('abort', onAbort);
		// Codex P2 (PR #371): `_preflightStream` runs eagerly when `queryStream`
		// is invoked, but the caller may abort between that pre-flight and the
		// listener registration above. `AbortSignal` does not replay events to
		// listeners added after the abort. Re-check `aborted` after registering
		// the listener so that race window doesn't end up running the SDK call
		// against a signal the caller has already cancelled.
		if (options?.signal?.aborted === true) {
			options.signal.removeEventListener('abort', onAbort);
			yield { type: 'error', error: new ClaudeCliError('QUERY_FAILED', 'Aborted before send') };
			return;
		}
		const timeout = ClaudeCliAdapter._makeTimeout(timeoutMs, controller);
		try {
			yield* this._streamSdk(prompt, controller, options, timeout);
		} catch (e: unknown) {
			yield { type: 'error', error: this._mapError(e, timeoutMs) };
		} finally {
			timeout.clear();
			options?.signal?.removeEventListener('abort', onAbort);
			controller.abort();
		}
	}

	private static _makeTimeout(
		timeoutMs: number,
		controller: AbortController,
	): { promise: Promise<never>; clear: () => void } {
		let timeoutId: ReturnType<typeof setTimeout> | undefined;
		const promise = new Promise<never>((_resolve, reject) => {
			// eslint-disable-next-line obsidianmd/prefer-active-window-timers
			timeoutId = setTimeout(() => {
				controller.abort();
				reject(new ClaudeCliError('TIMEOUT', `Query exceeded ${timeoutMs} ms`));
			}, timeoutMs);
		});
		// Swallow unhandled-rejection on the dangling timeout promise.
		promise.catch(() => undefined);
		return {
			promise,
			clear: (): void => {
				if (timeoutId !== undefined) {
					// eslint-disable-next-line obsidianmd/prefer-active-window-timers
					clearTimeout(timeoutId);
				}
			},
		};
	}

	/**
	 * Inner SDK consumer for `queryStream()`. Races each `gen.next()` call
	 * against the timeout promise so a hanging SDK call surfaces as a
	 * terminal `TIMEOUT` error rather than blocking the generator.
	 *
	 * The wire→delta translation is delegated to `StreamDeltaReducer`
	 * (ADR-0034). This method only:
	 *   1. Pulls the next SDK message off the iterator.
	 *   2. Translates it into a `RawClaudeEvent` (or skips if unknown).
	 *   3. Hands the event to the reducer and yields every returned delta.
	 *   4. Fires the optional `onSessionId` callback exactly once when the
	 *      reducer emits the `session-id` delta.
	 */
	private async *_streamSdk(
		prompt: string,
		controller: AbortController,
		options: ClaudeCliStreamOptions | undefined,
		timeout: { promise: Promise<never>; clear: () => void },
	): AsyncIterable<StreamDelta> {
		const gen = sdkQuery({
			prompt,
			options: {
				maxTurns: 1,
				abortController: controller,
				includePartialMessages: true,
			},
		});
		const reducer = new StreamDeltaReducer({ turnId: crypto.randomUUID() });
		let sessionIdFired = false;
		for (;;) {
			const next = await Promise.race([gen.next(), timeout.promise]);
			if (next.done === true) {
				// Codex P1 on PR #371: the SDK generator can close without
				// emitting a `result` message (abnormal SDK completion or a
				// clean-exit abort path). The `queryStream()` contract
				// requires every stream to end with `done` or `error`; without
				// a terminal delta here, direct streaming callers never
				// observe the turn end and `inFlightAbort` / `streamingText`
				// stay stuck. Surface as `QUERY_FAILED` so callers can clear
				// in-flight state via the existing error branch.
				for (const d of reducer.emitError(
					new ClaudeCliError('QUERY_FAILED', 'SDK stream ended without result'),
				)) {
					yield d;
				}
				return;
			}
			const raw = ClaudeCliAdapter._sdkMessageToRawEvent(next.value);
			if (raw === null) continue;
			for (const delta of reducer.consume(raw)) {
				if (delta.type === 'session-id' && !sessionIdFired) {
					sessionIdFired = true;
					ClaudeCliAdapter._fireOnSessionId(options, delta.sessionId);
				}
				yield delta;
			}
			if (reducer.terminated) return;
		}
	}

	/**
	 * Translate one `SDKMessage` envelope into the corresponding
	 * `RawClaudeEvent` for `StreamDeltaReducer.consume`. Returns `null` for
	 * SDK messages the reducer does not handle (e.g. `assistant`/`user`
	 * envelopes — the SDK adapter relies on `stream_event` for incremental
	 * text, never on whole-message envelopes, so dropping them here is
	 * forward-compatible).
	 */
	private static _sdkMessageToRawEvent(message: SdkMessage): RawClaudeEvent | null {
		if (message.type === 'system') {
			return ClaudeCliAdapter._systemEnvelopeRaw(message);
		}
		if (message.type === 'stream_event') {
			const inner =
				typeof message.event === 'object' && message.event !== null
					? (message.event as RawStreamEventInner)
					: null;
			if (inner === null) return null;
			return { kind: 'stream-event', event: inner };
		}
		if (message.type === 'result') {
			const subtype = typeof message.subtype === 'string' ? message.subtype : undefined;
			const result = typeof message.result === 'string' ? message.result : undefined;
			return { kind: 'result', subtype, result };
		}
		return null;
	}

	private static _systemEnvelopeRaw(message: SdkMessage): RawClaudeEvent | null {
		if (message.subtype === 'init') {
			const sid =
				typeof message.session_id === 'string' && message.session_id.length > 0
					? message.session_id
					: null;
			return { kind: 'system-init', sessionId: sid };
		}
		if (message.subtype === 'compact_boundary') {
			return { kind: 'system-compact-boundary' };
		}
		return null;
	}

	private static _fireOnSessionId(
		options: ClaudeCliStreamOptions | undefined,
		sid: SessionId,
	): void {
		if (options?.onSessionId === undefined) return;
		try {
			options.onSessionId(sid);
		} catch {
			/* Mirror subprocess adapter — swallow callback errors. */
		}
	}

	// ── Private helpers ───────────────────────────────────────────────────────

	private _unavailableCode(): 'API_KEY_MISSING' | 'NOT_INSTALLED' {
		return this._getApiKey().trim() === '' ? 'API_KEY_MISSING' : 'NOT_INSTALLED';
	}

	private _clampTimeout(raw?: number): number {
		return Math.min(Math.max(raw ?? 30_000, 1_000), 300_000);
	}

	private _mapError(e: unknown, timeoutMs: number): ClaudeCliError {
		if (e instanceof ClaudeCliError && e.errorCode === 'TIMEOUT') {
			this._logger.warn('ClaudeCliAdapter.query(): timeout', { timeoutMs });
			return e;
		}
		if (e instanceof Error) {
			if (/api.key|authentication|401/i.test(e.message)) {
				this._logger.warn('ClaudeCliAdapter.query(): API key error');
				return new ClaudeCliError('API_KEY_MISSING', 'Authentication failed', e);
			}
			this._logger.warn('ClaudeCliAdapter.query(): SDK error', { error: e.message });
			return new ClaudeCliError('QUERY_FAILED', 'Query failed', e);
		}
		this._logger.warn('ClaudeCliAdapter.query(): unknown error');
		return new ClaudeCliError('QUERY_FAILED', 'Unknown error', e);
	}
}
