import type { SessionId } from '@/domain/chat/SessionId';
import type { Result } from '@/domain/shared/Result';

/**
 * Discriminator for ClaudeCliError. Each code maps to one UI copy string:
 *   NOT_INSTALLED      → "AI assistant is not available right now."
 *   API_KEY_MISSING    → "Chat is not set up yet."
 *   TIMEOUT            → "That took too long. Please try again."
 *   QUERY_FAILED       → "Something went wrong. Please try again."
 *   CLI_LAUNCH_FAILED  → "Chat needs the Claude command-line tool." (SPEC-ASM-001 §2.7)
 *
 * Satisfies REQ-CCS-021, REQ-ASM-009.
 */
export type ClaudeCliErrorCode =
	| 'NOT_INSTALLED' // Binary could not be resolved or the SDK failed to start
	| 'API_KEY_MISSING' // ANTHROPIC_API_KEY was empty at query time
	| 'TIMEOUT' // No response received within timeoutMs
	| 'QUERY_FAILED' // SDK call returned an error or threw an unexpected exception
	| 'CLI_LAUNCH_FAILED'; // Subprocess spawn failed (R-ASM-002 AppArmor / userns) — SPEC-ASM-001 §2.7

export class ClaudeCliError extends Error {
	public readonly name = 'ClaudeCliError';

	constructor(
		public readonly errorCode: ClaudeCliErrorCode,
		message: string,
		/** Original SDK or system error. Used for logging only; never surfaced in UI. */
		public readonly cause?: unknown,
	) {
		super(message);
		// Restore prototype chain (required for instanceof checks in transpiled code).
		Object.setPrototypeOf(this, new.target.prototype);
	}
}

/**
 * Options forwarded to the underlying SDK call. All fields are optional.
 * Satisfies REQ-CCS-021.
 */
export interface ClaudeCliQueryOptions {
	/**
	 * Maximum wall-clock time the adapter waits for a response before returning
	 * ClaudeCliError{TIMEOUT}. Unit: milliseconds.
	 * Default: 30 000. Valid range: [1 000, 300 000].
	 * Values outside the range are silently clamped by the adapter.
	 * Satisfies NFR-CCS-003.
	 */
	readonly timeoutMs?: number;

	/**
	 * Maximum number of agent turns. Fixed at 1 in v1.
	 * Values > 1 are clamped to 1 by the adapter (logged at warn level; not surfaced to the user).
	 * Reserved for v2 multi-turn support.
	 */
	readonly maxTurns?: number;

	/**
	 * Optional suffix appended to the system prompt for stage-aware context
	 * (ADR-0027, SPEC-ASM-001 §2.6 and design.md C4). The subscription transport
	 * forwards this verbatim as `--append-system-prompt <value>`; the SDK adapter
	 * ignores it. Empty strings are treated the same as `undefined` — the flag
	 * is omitted.
	 * Satisfies REQ-ASM-013.
	 */
	readonly systemPromptSuffix?: string;

	/**
	 * Optional Claude session identifier used to resume an existing conversation.
	 * The subscription transport forwards this as `--resume <sessionId>`; the SDK
	 * adapter logs at debug level and ignores it (subscription transport only).
	 * Satisfies REQ-ASM-035.
	 */
	readonly resumeSessionId?: SessionId;

	/**
	 * Optional callback invoked exactly once per `query()` call the first time a
	 * non-empty `session_id` is captured from a `system/init` event on the
	 * stream-json wire (REQ-ASM-031). The subscription transport invokes this
	 * synchronously from inside the NDJSON event handler so the caller can
	 * thread the captured id back as `resumeSessionId` on the next turn
	 * (REQ-ASM-035). The SDK adapter ignores it. Implementors must guarantee
	 * a single invocation per turn even if multiple `system/init` events arrive.
	 * Satisfies REQ-ASM-031.
	 */
	readonly onSessionId?: (sessionId: SessionId) => void;
}

/**
 * Options for the streaming variant `queryStream()` introduced in Increment 2
 * of `specs/agent-sidepanel-v2/` (REQ-ASV-053). Superset of
 * `ClaudeCliQueryOptions` adding an `AbortSignal` so the UI's stop-generation
 * control can cancel an in-flight turn. The legacy `query()` method
 * intentionally lacks this; cancellation is the differentiator.
 */
export interface ClaudeCliStreamOptions extends ClaudeCliQueryOptions {
	/**
	 * Caller-supplied abort signal. When `signal.aborted` becomes true, the
	 * adapter MUST terminate the underlying subprocess / SDK call and emit a
	 * single `{ type: 'error', error: ClaudeCliError{QUERY_FAILED} }` delta
	 * (or the existing `{ type: 'done' }` if the abort raced a successful
	 * completion). The adapter MUST NOT throw on abort.
	 *
	 * Optional so unit tests and the legacy free-text call sites can omit it.
	 * Production wiring threads a fresh `AbortController.signal` per turn
	 * from `ChatSidebar`'s Stop button click handler.
	 */
	readonly signal?: AbortSignal;
}

/**
 * Discriminated-union delta emitted by `ClaudeCliPort.queryStream()`. Each
 * delta represents one observable event from the underlying transport:
 *
 *   - `text`        — incremental assistant-message text; concatenate to
 *                     render the streaming bubble. Multiple `text` deltas
 *                     arrive over the lifetime of one turn.
 *   - `session-id`  — captured `session_id` from the transport's
 *                     `system/init` event. Fires at most once per turn.
 *                     Mirrors the existing `onSessionId` callback so the
 *                     UI can dispatch `captureSessionId` reactively.
 *   - `done`        — terminal success. No further deltas arrive after this.
 *   - `error`       — terminal failure. No further deltas arrive after this.
 *
 * `done` and `error` are mutually exclusive: exactly one of the two ends
 * each stream. The SDK adapter currently emits final `text` + `done`;
 * future increments may add `tool-use` / `thinking` variants under the
 * same union — additive only.
 */
export type StreamDelta =
	| { readonly type: 'text'; readonly text: string }
	| { readonly type: 'session-id'; readonly sessionId: SessionId }
	| { readonly type: 'done' }
	| { readonly type: 'error'; readonly error: ClaudeCliError };

/**
 * Narrow port for the Claude CLI subprocess adapter (ADR-008).
 * The interface file must not import from 'obsidian' or '@anthropic-ai/claude-agent-sdk'.
 * Satisfies REQ-CCS-021.
 */
export interface ClaudeCliPort {
	/**
	 * Send a fully-assembled prompt string to Claude and return the full text response.
	 * Never throws. Returns Result<string, ClaudeCliError>.
	 * The promise resolves when the response arrives or when an error/timeout occurs.
	 * Satisfies REQ-CCS-013, REQ-CCS-016, NFR-CCS-003.
	 */
	query(prompt: string, options?: ClaudeCliQueryOptions): Promise<Result<string, ClaudeCliError>>;

	/**
	 * Returns true if the adapter is ready to accept queries.
	 * Returns false for all degraded conditions: missing API key, startup failure,
	 * binary not found, browser/mobile stubs.
	 * This method must not throw. Implementors must catch all errors internally
	 * and return false.
	 * Satisfies REQ-CCS-018, REQ-CCS-019, REQ-CCS-022.
	 */
	isAvailable(): Promise<boolean>;

	/**
	 * Pre-warm the subprocess. Called from onload() before the first user interaction.
	 * Must not throw; log errors internally and return.
	 * Satisfies REQ-CCS-003, NFR-CCS-002.
	 */
	startup(): Promise<void>;

	/**
	 * Terminate the subprocess. Called from onunload() which is synchronous.
	 * Must be synchronous (fire-and-forget is acceptable).
	 * Must not throw.
	 * Satisfies REQ-CCS-017, NFR-CCS-007.
	 */
	shutdown(): void;

	/**
	 * Stream a fully-assembled prompt to Claude and yield deltas as they
	 * arrive. Never throws — every terminal condition is delivered as a
	 * `done` or `error` delta. The caller cancels via `options.signal`;
	 * cancellation results in an `error` delta (`QUERY_FAILED`) unless the
	 * cancellation races a `done`, in which case `done` wins.
	 *
	 * Implementors MUST:
	 *   - emit at most one `session-id` delta per stream (mirrors the
	 *     one-fire semantics of `ClaudeCliQueryOptions.onSessionId`);
	 *   - emit exactly one of `done` or `error` as the final delta;
	 *   - close the iterable after the terminal delta — no further deltas;
	 *   - never throw; surface every error path through `error`.
	 *
	 * Introduced for IDEA-ASV-001 Increment 2 (streaming responses + stop
	 * generation). The legacy `query()` method remains for call sites that
	 * don't need streaming — both methods coexist and may be implemented
	 * independently.
	 */
	queryStream(prompt: string, options?: ClaudeCliStreamOptions): AsyncIterable<StreamDelta>;
}

/**
 * Build a `queryStream`-shaped async iterable from a non-streaming `query()`
 * function. Emits the resolved text as a single `text` delta + `done`, or a
 * single `error` delta on failure. Useful for ports that don't (yet) have a
 * real streaming pipeline — test fixtures, the standalone-web
 * `LocalStorageBridge`, and the bridge stubs on the real adapters in
 * PR-ASV-2-port.
 *
 * Honours `options.signal` in two phases:
 *   1. Pre-flight: if the signal is already aborted, yield an error delta
 *      without invoking `query` at all.
 *   2. Mid-flight: while `query()` is in flight, listen for an abort and
 *      race the result against the abort event. On abort, yield the error
 *      delta and return immediately — the underlying `query()` call is
 *      orphaned (it cannot be cancelled because the legacy contract has no
 *      signal parameter), but the iterable's contract is honoured.
 *
 * Codex P2 on PR #370: the original implementation only checked pre-flight,
 * which broke cancellation semantics for stub-delegating adapters.
 */
export async function* streamFromQuery(
	query: (
		prompt: string,
		options?: ClaudeCliQueryOptions,
	) => Promise<Result<string, ClaudeCliError>>,
	prompt: string,
	options?: ClaudeCliStreamOptions,
): AsyncIterable<StreamDelta> {
	const abortDelta = (): StreamDelta => ({
		type: 'error',
		error: new ClaudeCliError('QUERY_FAILED', 'Request was aborted'),
	});

	if (options?.signal?.aborted === true) {
		yield abortDelta();
		return;
	}

	const queryPromise = query(prompt, options);
	const signal = options?.signal;
	if (signal !== undefined) {
		const ABORTED = Symbol('aborted');
		const abortPromise = new Promise<typeof ABORTED>((resolve) => {
			signal.addEventListener(
				'abort',
				() => {
					resolve(ABORTED);
				},
				{ once: true },
			);
		});
		const winner = await Promise.race([queryPromise, abortPromise]);
		if (winner === ABORTED) {
			yield abortDelta();
			return;
		}
		const result = winner;
		if (!result.ok) {
			yield { type: 'error', error: result.error };
			return;
		}
		yield { type: 'text', text: result.value };
		yield { type: 'done' };
		return;
	}

	const result = await queryPromise;
	if (!result.ok) {
		yield { type: 'error', error: result.error };
		return;
	}
	yield { type: 'text', text: result.value };
	yield { type: 'done' };
}
