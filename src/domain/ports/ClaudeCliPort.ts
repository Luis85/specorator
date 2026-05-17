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
 * Options forwarded to the underlying SDK / subprocess call. All fields are
 * optional. Shared by `queryStream` (free-text streaming) and `runStructured`
 * (structured-output, subscription transport only).
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
	 * Optional callback invoked exactly once per turn the first time a
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
 * Options for `queryStream()` — superset of `ClaudeCliQueryOptions` adding
 * an `AbortSignal` so the UI's stop-generation control can cancel an
 * in-flight turn.
 */
export interface ClaudeCliStreamOptions extends ClaudeCliQueryOptions {
	/**
	 * Caller-supplied abort signal. When `signal.aborted` becomes true, the
	 * adapter MUST terminate the underlying subprocess / SDK call and emit a
	 * single `{ type: 'error', error: ClaudeCliError{QUERY_FAILED} }` delta
	 * (or the existing `{ type: 'done' }` if the abort raced a successful
	 * completion). The adapter MUST NOT throw on abort.
	 *
	 * Optional so unit tests can omit it. Production wiring threads a fresh
	 * `AbortController.signal` per turn from `ChatSidebar`'s Stop button
	 * click handler.
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
 * each stream. Future increments may add `tool-use` / `thinking` variants
 * under the same union — additive only.
 */
export type StreamDelta =
	| { readonly type: 'text'; readonly text: string }
	/**
	 * Incremental thinking-mode text from an extended-thinking turn. Emitted
	 * alongside `text` when the model reasons before answering. UI may render
	 * this in a collapsed `<details>` block above the streaming bubble.
	 */
	| { readonly type: 'thinking'; readonly text: string }
	| { readonly type: 'session-id'; readonly sessionId: SessionId }
	/**
	 * First sighting of a tool-use content block. `blockId` is a per-stream
	 * identifier (NOT the SDK's `id` field) so callers can correlate the
	 * subsequent `tool-use-input-delta` and `tool-use-stop` deltas back to
	 * this block. `inputJson` is the initial partial JSON fragment (often
	 * empty until the next `input_json_delta`).
	 */
	| {
			readonly type: 'tool-use-start';
			readonly blockId: string;
			readonly toolName: string;
			readonly inputJson: string;
	  }
	/**
	 * Additional partial JSON for the tool's `input` field. Callers
	 * concatenate `inputJson` strings keyed by `blockId` to reconstruct
	 * the full tool argument payload (which may need JSON-repair until
	 * `tool-use-stop`).
	 */
	| {
			readonly type: 'tool-use-input-delta';
			readonly blockId: string;
			readonly inputJson: string;
	  }
	/**
	 * Terminal marker for a tool-use block. The accumulated `inputJson`
	 * for `blockId` is now complete and safe to `JSON.parse`.
	 */
	| { readonly type: 'tool-use-stop'; readonly blockId: string }
	/**
	 * Conversation-compaction boundary (SDK `SDKCompactBoundaryMessage`).
	 * Long sessions silently rewrite history when the SDK auto-compacts;
	 * the UI surfaces this as a synthetic system message in the transcript
	 * so the user knows context older than this point may no longer be
	 * present in the model's view.
	 */
	| { readonly type: 'compact-boundary'; readonly reason?: string }
	/**
	 * Token usage telemetry from `message_start` / `message_delta`. Some
	 * Anthropic-compatible endpoints push usage on `message_start` (where
	 * `output_tokens` is 0) and update on `message_delta`; consumers should
	 * treat the latest non-zero values as authoritative.
	 */
	| {
			readonly type: 'usage';
			readonly inputTokens: number;
			readonly outputTokens: number;
	  }
	| { readonly type: 'done' }
	| { readonly type: 'error'; readonly error: ClaudeCliError };

/**
 * Raw response from a structured-output Claude CLI invocation
 * (`claude -p '<prompt>' --output-format json --json-schema '<schema>'`).
 *
 * `result` is the model's free-text payload; `structured_output` is the
 * schema-validated JSON object (or `unknown` for the application-layer
 * parser to validate via Zod). Both fields are populated by the adapter
 * from a single `JSON.parse` of the subprocess's full stdout
 * (SPEC-ASM-001 §4.2 `runStructured` row).
 *
 * Moved onto the port file in WP-12 — previously lived in the application
 * layer's `queryStructured.ts` sidecar.
 */
export interface StructuredCliRawResult {
	readonly result: string;
	readonly structured_output: unknown;
}

/**
 * Options forwarded to `runStructured()`. Mirror of the relevant fields from
 * `ClaudeCliQueryOptions`; kept as a separate interface so the structured
 * surface can evolve without widening the free-text streaming surface.
 *
 * Moved onto the port file in WP-12.
 */
export interface StructuredCliCallOptions {
	readonly systemPromptSuffix?: string;
	readonly resumeSessionId?: string;
	readonly timeoutMs?: number;
	/**
	 * Optional caller-supplied callback invoked exactly once when the
	 * structured call's response envelope yields a non-empty `session_id`
	 * (REQ-ASM-031, REQ-ASM-046). Mirrors the free-text streaming surface's
	 * `onSessionId` contract.
	 */
	readonly onSessionId?: (sessionId: SessionId) => void;
}

/**
 * Narrow port for the Claude CLI adapters (ADR-008).
 *
 * The interface file must not import from 'obsidian' or
 * '@anthropic-ai/claude-agent-sdk'.
 *
 * Reshaped in WP-12 (Arch review #3) to a single canonical streaming method
 * plus the optional structured-output method that subscription-capable
 * adapters expose. Lifecycle (`startup` / `shutdown`) lives on the sibling
 * `TransportLifecyclePort`; the free-text non-streaming `query()` method
 * is gone — non-streaming callers funnel `queryStream` through
 * `collectStream()` in `src/application/chat/collectStream.ts`.
 *
 * Satisfies REQ-CCS-021, REQ-ASM-001.
 */
export interface ClaudeCliPort {
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
	 * Sole canonical streaming method (WP-12). Non-streaming consumers use
	 * `collectStream()` from `@/application/chat/collectStream` to converge
	 * the stream to a `Result<string, ClaudeCliError>`.
	 */
	queryStream(prompt: string, options?: ClaudeCliStreamOptions): AsyncIterable<StreamDelta>;

	/**
	 * Structured-output one-shot for subscription-capable adapters.
	 *
	 * Optional: the SDK adapter and the bridge / degraded sentinels do not
	 * expose it (the `?` makes calling it a `typeof port.runStructured === 'function'`
	 * narrowing site). The application-layer `queryStructured()` wrapper
	 * performs that narrowing — call sites never reach for `instanceof`
	 * (which would force a domain ⇄ infrastructure import).
	 *
	 * Folded onto the port in WP-12; previously lived behind the
	 * `SubscriptionCapable` structural sidecar in
	 * `application/chat/queryStructured.ts`. The new shape is narrower
	 * *per responsibility* — there is one streaming port and one lifecycle
	 * port, not one port with two unrelated halves.
	 *
	 * Never throws. Returns `Result<StructuredCliRawResult, ClaudeCliError>`;
	 * envelope parsing happens in the application layer.
	 *
	 * Satisfies REQ-ASM-021, REQ-ASM-049.
	 */
	runStructured?(
		prompt: string,
		options: StructuredCliCallOptions,
	): Promise<Result<StructuredCliRawResult, ClaudeCliError>>;
}
