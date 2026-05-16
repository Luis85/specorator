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
import { asSessionId, type SessionId } from '@/domain/chat/SessionId';
import type { LoggerPort } from '@/domain/ports';
import type { PluginSettings } from '@/domain/settings/PluginSettings';

/**
 * Loosely-typed view of the SDK message union. Only the fields actually
 * dispatched in `_dispatchMessage` are listed — keeps the file decoupled
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
 * Loosely-typed view of one `stream_event` payload. Mirrors the
 * Anthropic SDK's `RawMessageStreamEvent` family without importing
 * the type so we stay decoupled from the SDK's exact shape.
 */
interface StreamEvent {
	type?: string;
	index?: number;
	content_block?: {
		type?: string;
		name?: string;
		input?: unknown;
	};
	delta?: {
		type?: string;
		text?: string;
		thinking?: string;
		partial_json?: string;
	};
	usage?: { input_tokens?: number; output_tokens?: number };
	message?: { usage?: { input_tokens?: number; output_tokens?: number } };
}

/**
 * Per-stream mutable state passed through `_dispatchMessage`. Tracks
 * the session-id one-fire flag, the text-emitted flag (so a turn with
 * zero `text_delta`s can still emit the `result` fallback), and the
 * content-block kind table that lets `content_block_stop` emit the
 * right terminal delta per block kind.
 */
interface StreamState {
	turnId: string;
	sessionIdEmitted: boolean;
	textEmitted: boolean;
	/**
	 * Monotonic message-index within the stream. Bumped on every
	 * `message_start` event. Codex P1 (PR #378): Anthropic's
	 * `content_block_*` indices are scoped to a single message and can
	 * restart at 0 on later `message_start` events in the same streamed
	 * turn (multi-step tool loops). Without a per-message discriminator,
	 * distinct tool calls could reuse the same `blockId` and downstream
	 * accumulators keyed by `blockId` would merge deltas into the wrong
	 * entry. `blockId` is now `${turnId}-${messageSeq}-${index}`.
	 */
	messageSeq: number;
	blockKinds: Map<number, { kind: 'text' | 'thinking' | 'tool_use'; blockId: string }>;
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
	/** Getter for current plugin settings. Injected; never stored as a snapshot. */
	private readonly _getSettings: () => PluginSettings;
	/** Logger for internal diagnostics. Never logs the API key value. */
	private readonly _logger: LoggerPort;
	/** Binary resolver — injectable for testability (defaults to require.resolve). */
	private readonly _resolveCliPath: () => string;

	constructor(
		getSettings: () => PluginSettings,
		logger: LoggerPort,
		resolveCliPath?: () => string,
	) {
		this._getSettings = getSettings;
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

		const key = this._getSettings().anthropicApiKey.trim();

		// Step 1: Check for empty/whitespace key.
		if (!key) {
			this._logger.warn(
				'ClaudeCliAdapter.startup(): anthropicApiKey is empty — adapter will not start',
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
		return this._available && this._getSettings().anthropicApiKey.trim() !== '';
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
		const currentKey = this._getSettings().anthropicApiKey.trim();
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
	 * Dispatch table:
	 *   - `system` (subtype `'init'`)      → at most one `session-id` delta
	 *   - `stream_event` `content_block_delta` `text_delta` → `text` delta
	 *   - `assistant`                      → fallback text delta if no
	 *                                        `stream_event` text arrived
	 *   - `result`                         → fallback text from
	 *                                        `result.result`, then `done`
	 *
	 * The fallback paths cover degenerate SDK callers (tests that emit only
	 * `result`) and degraded production scenarios where
	 * `includePartialMessages` is silently ignored.
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
		const state: StreamState = {
			turnId: crypto.randomUUID(),
			sessionIdEmitted: false,
			textEmitted: false,
			messageSeq: 0,
			blockKinds: new Map(),
		};
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
				yield {
					type: 'error',
					error: new ClaudeCliError('QUERY_FAILED', 'SDK stream ended without result'),
				};
				return;
			}
			const out = this._dispatchMessage(next.value, state, options);
			for (const delta of out.deltas) yield delta;
			if (out.terminal) return;
		}
	}

	/**
	 * Pure message dispatch helper. Returns the deltas to emit for one SDK
	 * message and whether the stream should terminate after them. Keeping
	 * this side-effect-free (modulo the `onSessionId` callback, which the
	 * port contract demands) lets the outer loop stay simple.
	 *
	 * Extended in PR-ASV-2-delta-extension to handle the wider event
	 * surface from `--include-partial-messages`: `thinking_delta`,
	 * `input_json_delta`, `content_block_start/stop` for tool_use blocks,
	 * `system/compact_boundary`, and `message_start/delta` token usage.
	 * The `state.blockKinds` map keys an SDK content-block index to the
	 * kind we observed at `content_block_start` so the corresponding
	 * `content_block_stop` can emit the right terminal delta — text
	 * blocks don't emit a stop delta, tool_use blocks do.
	 */
	private _dispatchMessage(
		message: SdkMessage,
		state: StreamState,
		options: ClaudeCliStreamOptions | undefined,
	): { deltas: StreamDelta[]; terminal: boolean } {
		if (message.type === 'system' && message.subtype === 'init') {
			return ClaudeCliAdapter._dispatchSystemInit(message, state, options);
		}
		if (message.type === 'system' && message.subtype === 'compact_boundary') {
			return { deltas: [{ type: 'compact-boundary' }], terminal: false };
		}
		if (message.type === 'stream_event') {
			return ClaudeCliAdapter._dispatchStreamEvent(message, state);
		}
		if (message.type === 'result') {
			return ClaudeCliAdapter._dispatchResult(message, state);
		}
		return { deltas: [], terminal: false };
	}

	private static _dispatchSystemInit(
		message: SdkMessage,
		state: StreamState,
		options: ClaudeCliStreamOptions | undefined,
	): { deltas: StreamDelta[]; terminal: boolean } {
		const deltas: StreamDelta[] = [];
		const sid = ClaudeCliAdapter._extractSessionId(message);
		if (sid !== null && !state.sessionIdEmitted) {
			state.sessionIdEmitted = true;
			deltas.push({ type: 'session-id', sessionId: sid });
			ClaudeCliAdapter._fireOnSessionId(options, sid);
		}
		return { deltas, terminal: false };
	}

	private static _dispatchStreamEvent(
		message: SdkMessage,
		state: StreamState,
	): { deltas: StreamDelta[]; terminal: boolean } {
		const deltas: StreamDelta[] = [];
		const event = ClaudeCliAdapter._asStreamEvent(message);
		if (event === null) return { deltas, terminal: false };
		// Token usage telemetry — `message_start` and `message_delta`
		// carry `usage` at the message root. Read both because some
		// Anthropic-compatible endpoints push usage only on `message_delta`.
		if (event.type === 'message_start' || event.type === 'message_delta') {
			// Codex P1 on PR #378: bump `messageSeq` AND reset `blockKinds`
			// on every `message_start` so subsequent `content_block_start`
			// events get a fresh blockId namespace. Anthropic's
			// content-block index resets to 0 per message; without this
			// reset, a second message in the same stream (multi-step tool
			// loop) would overwrite the first message's entries.
			if (event.type === 'message_start') {
				state.messageSeq++;
				state.blockKinds = new Map();
			}
			const usage = ClaudeCliAdapter._extractUsage(event);
			if (usage !== null) deltas.push(usage);
			return { deltas, terminal: false };
		}
		if (event.type === 'content_block_start') {
			ClaudeCliAdapter._handleBlockStart(event, state, deltas);
			return { deltas, terminal: false };
		}
		if (event.type === 'content_block_delta') {
			ClaudeCliAdapter._handleBlockDelta(event, state, deltas);
			return { deltas, terminal: false };
		}
		if (event.type === 'content_block_stop') {
			ClaudeCliAdapter._handleBlockStop(event, state, deltas);
			return { deltas, terminal: false };
		}
		return { deltas, terminal: false };
	}

	private static _asStreamEvent(message: SdkMessage): StreamEvent | null {
		if (!ClaudeCliAdapter._isStreamEvent(message.event)) return null;
		return message.event;
	}

	private static _isStreamEvent(raw: unknown): raw is StreamEvent {
		return typeof raw === 'object' && raw !== null;
	}

	private static _handleBlockStart(
		event: StreamEvent,
		state: StreamState,
		deltas: StreamDelta[],
	): void {
		const index = typeof event.index === 'number' ? event.index : -1;
		if (index < 0) return;
		const block = event.content_block;
		if (block === undefined) return;
		// Codex P1 on PR #378: include `messageSeq` so multi-step tool
		// loops (where content-block indices restart at 0 per message)
		// produce unique blockIds across the whole stream.
		const blockId = `${state.turnId}-${state.messageSeq}-${index}`;
		// Codex P2 on PR #378: any block whose `type` ends with `_tool_use`
		// or equals `tool_use` is part of the tool-use lifecycle (covers
		// `tool_use`, `server_tool_use`, future Anthropic-API variants).
		// The previous strict equality dropped non-`tool_use` variants and
		// their subsequent `input_json_delta` chunks vanished.
		if (typeof block.type === 'string' && block.type.endsWith('tool_use')) {
			state.blockKinds.set(index, { kind: 'tool_use', blockId });
			// Codex P1 on PR #378: do NOT seed `inputJson` with the
			// block-start payload. The SDK ships an empty `{}` placeholder
			// at start and the real JSON arrives via `input_json_delta`.
			// Seeding `JSON.stringify({})` corrupted callers that
			// concatenate by `blockId` — final reconstruction was
			// `"{}" + "<partial>"` which is unparseable.
			deltas.push({
				type: 'tool-use-start',
				blockId,
				toolName: typeof block.name === 'string' ? block.name : 'unknown',
				inputJson: '',
			});
			return;
		}
		if (block.type === 'thinking') {
			state.blockKinds.set(index, { kind: 'thinking', blockId });
			return;
		}
		// Text blocks need no start delta — `text_delta` handler accumulates.
		state.blockKinds.set(index, { kind: 'text', blockId });
	}

	private static _handleBlockDelta(
		event: StreamEvent,
		state: StreamState,
		deltas: StreamDelta[],
	): void {
		const index = typeof event.index === 'number' ? event.index : -1;
		const delta = event.delta;
		if (index < 0 || delta === undefined) return;
		const out = ClaudeCliAdapter._mapBlockDelta(delta, index, state);
		if (out !== null) {
			if (out.type === 'text') state.textEmitted = true;
			deltas.push(out);
		}
	}

	private static _mapBlockDelta(
		delta: NonNullable<StreamEvent['delta']>,
		index: number,
		state: StreamState,
	): StreamDelta | null {
		if (delta.type === 'text_delta' && typeof delta.text === 'string' && delta.text.length > 0) {
			return { type: 'text', text: delta.text };
		}
		if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string') {
			return { type: 'thinking', text: delta.thinking };
		}
		if (delta.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
			const tracked = state.blockKinds.get(index);
			if (tracked?.kind !== 'tool_use') return null;
			return {
				type: 'tool-use-input-delta',
				blockId: tracked.blockId,
				inputJson: delta.partial_json,
			};
		}
		return null;
	}

	private static _handleBlockStop(
		event: StreamEvent,
		state: StreamState,
		deltas: StreamDelta[],
	): void {
		const index = typeof event.index === 'number' ? event.index : -1;
		if (index < 0) return;
		const tracked = state.blockKinds.get(index);
		state.blockKinds.delete(index);
		if (tracked?.kind === 'tool_use') {
			deltas.push({ type: 'tool-use-stop', blockId: tracked.blockId });
		}
	}

	private static _extractUsage(event: StreamEvent): StreamDelta | null {
		const usage = event.usage ?? event.message?.usage;
		if (usage === undefined) return null;
		const input = typeof usage.input_tokens === 'number' ? usage.input_tokens : 0;
		const output = typeof usage.output_tokens === 'number' ? usage.output_tokens : 0;
		// Skip zero-zero updates — they're noise from `message_start` on
		// endpoints that don't fill in tokens until `message_delta`.
		if (input === 0 && output === 0) return null;
		return { type: 'usage', inputTokens: input, outputTokens: output };
	}

	/**
	 * Result-message dispatch (extracted from `_dispatchMessage` to keep its
	 * cyclomatic complexity below the lint cap).
	 *
	 * Codex P1 (PR #371): `result` messages discriminate on `subtype`. Only
	 * `'success'` is a real success; the error variants
	 * (`error_during_execution`, `error_max_turns`, `error_max_budget_usd`,
	 * `error_max_structured_output_retries`) must surface as a terminal
	 * `error` delta — otherwise the stream would resolve as success with
	 * an empty body and `query()` would return `ok('')` instead of
	 * `err(QUERY_FAILED)`.
	 */
	private static _dispatchResult(
		message: SdkMessage,
		state: { textEmitted: boolean },
	): { deltas: StreamDelta[]; terminal: boolean } {
		if (typeof message.subtype === 'string' && message.subtype !== 'success') {
			return {
				deltas: [
					{
						type: 'error',
						error: new ClaudeCliError(
							'QUERY_FAILED',
							`SDK returned result error: ${message.subtype}`,
						),
					},
				],
				terminal: true,
			};
		}
		const deltas: StreamDelta[] = [];
		if (!state.textEmitted) {
			const fallback = ClaudeCliAdapter._extractResultText(message);
			if (fallback !== null) deltas.push({ type: 'text', text: fallback });
		}
		deltas.push({ type: 'done' });
		return { deltas, terminal: true };
	}

	private static _extractSessionId(message: { session_id?: unknown }): SessionId | null {
		const raw = message.session_id;
		if (typeof raw !== 'string' || raw.length === 0) return null;
		return asSessionId(raw);
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

	private static _extractResultText(message: { result?: unknown }): string | null {
		if (typeof message.result === 'string' && message.result.length > 0) {
			return message.result;
		}
		return null;
	}

	// ── Private helpers ───────────────────────────────────────────────────────

	private _unavailableCode(): 'API_KEY_MISSING' | 'NOT_INSTALLED' {
		return this._getSettings().anthropicApiKey.trim() === '' ? 'API_KEY_MISSING' : 'NOT_INSTALLED';
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
