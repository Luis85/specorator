import type { SessionId } from '@/domain/chat/SessionId';
import type { Result } from '@/domain/shared/Result';

/**
 * Discriminator for {@link ChatTransportError}. Each code maps to one UI
 * copy string:
 *   NOT_INSTALLED         → "AI assistant is not available right now."
 *   API_KEY_MISSING       → "Chat is not set up yet."
 *   TIMEOUT               → "That took too long. Please try again."
 *   QUERY_FAILED          → "Something went wrong. Please try again."
 *   CLI_LAUNCH_FAILED     → "Chat needs the Claude command-line tool." (SPEC-ASM-001 §2.7)
 *   ATTACHMENT_TOO_LARGE  → "Attachment exceeds the 5 MB limit." (REQ-MPS-044)
 *   PROVIDER_UNAVAILABLE  → "This provider is not available yet." (cursor preview disabled)
 *
 * Renamed from `ChatTransportErrorCode` in WS-1 (ADR-MPS-001). The two
 * `*` codes are additive members introduced for the multi-provider
 * workstreams; no existing variant changed shape.
 *
 * Satisfies REQ-CCS-021, REQ-ASM-009, REQ-MPS-001, REQ-MPS-002, REQ-MPS-044.
 */
export type ChatTransportErrorCode =
	| 'NOT_INSTALLED' // Binary could not be resolved or the SDK failed to start
	| 'API_KEY_MISSING' // ANTHROPIC_API_KEY was empty at query time
	| 'TIMEOUT' // No response received within timeoutMs
	| 'QUERY_FAILED' // SDK call returned an error or threw an unexpected exception
	| 'CLI_LAUNCH_FAILED' // Subprocess spawn failed (R-ASM-002 AppArmor / userns) — SPEC-ASM-001 §2.7
	| 'ATTACHMENT_TOO_LARGE' // Per-turn attachment payload exceeded the 5 MB cap (REQ-MPS-044)
	| 'PROVIDER_UNAVAILABLE'; // Provider/mode disabled (e.g. cursorApiPreview === false)

export class ChatTransportError extends Error {
	public readonly name = 'ChatTransportError';

	constructor(
		public readonly errorCode: ChatTransportErrorCode,
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
 *
 * Renamed from `ChatTransportQueryOptions` in WS-1 (ADR-MPS-001).
 *
 * Satisfies REQ-CCS-021, REQ-MPS-001.
 */
export interface ChatTransportQueryOptions {
	/**
	 * Maximum wall-clock time the adapter waits for a response before returning
	 * ChatTransportError{TIMEOUT}. Unit: milliseconds.
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

	/**
	 * WS-8 (REQ-MPS-036/037). Plan-mode hint. Subscription transports translate
	 * this to `--permission-mode plan`; API transports forward it in the request
	 * body. Adapters that do not support plan mode ignore it.
	 */
	readonly planMode?: boolean;

	/**
	 * WS-8 (REQ-MPS-040). Selected model id. Adapters that expose models map
	 * this to the underlying provider's model parameter; transports with no
	 * model surface ignore it.
	 */
	readonly model?: string;

	/**
	 * WS-8 (REQ-MPS-042/043). Per-turn attachments. Adapters that do not
	 * advertise `supportsAttachments` discard the array silently.
	 */
	readonly attachments?: ReadonlyArray<ChatTransportAttachment>;
}

/**
 * Per-turn attachment payload. `kind: 'vault'` entries carry only a path and
 * are resolved by the adapter via `VaultPort.readFile` so the in-memory cap
 * applies to the resolved bytes, not the pre-resolved chip. REQ-MPS-042..044.
 */
export interface ChatTransportAttachment {
	readonly kind?: 'image' | 'file' | 'vault';
	readonly mimeType?: string;
	readonly bytes?: ArrayBuffer | null;
	readonly path?: string | null;
	readonly label?: string;
	readonly byteLength: number;
	readonly source?: 'vault' | 'paste' | 'drop' | 'file';
}

/**
 * One inline tool-approval request raised by the underlying provider mid-turn.
 *
 * Carried through `ChatTransportStreamOptions.approveTool` (REQ-MPS-045). The
 * UI renders an `ApprovalCard` (SPEC-MPS-001 §8.4) that resolves to
 * `true` (allow this invocation) or `false` (deny). The decision rule
 * (`allow-once` vs `always`) is a UI concern handled by `useApprovalRulesStore`;
 * the adapter only sees a boolean.
 */
export interface ChatTransportApprovalRequest {
	/** Tool name (e.g. `'Write'`, `'Edit'`, `'Bash'`, or provider-specific). */
	readonly tool: 'Write' | 'Edit' | 'Bash' | string;
	/** Path glob (non-Bash) or command name (Bash). Matches `ApprovalRule.scope`. */
	readonly scope: string;
	/**
	 * Optional human-readable preview the UI surfaces above the action
	 * buttons (e.g. a diff hunk, a Bash command line). `null` when the
	 * adapter cannot construct one.
	 */
	readonly previewText: string | null;
}

/**
 * Options for `queryStream()` — superset of `ChatTransportQueryOptions`
 * adding an `AbortSignal` so the UI's stop-generation control can cancel
 * an in-flight turn.
 *
 * Renamed from `ChatTransportStreamOptions` in WS-1 (ADR-MPS-001).
 */
export interface ChatTransportStreamOptions extends ChatTransportQueryOptions {
	/**
	 * Caller-supplied abort signal. When `signal.aborted` becomes true, the
	 * adapter MUST terminate the underlying subprocess / SDK call and emit a
	 * single `{ type: 'error', error: ChatTransportError{QUERY_FAILED} }` delta
	 * (or the existing `{ type: 'done' }` if the abort raced a successful
	 * completion). The adapter MUST NOT throw on abort.
	 *
	 * Optional so unit tests can omit it. Production wiring threads a fresh
	 * `AbortController.signal` per turn from `ChatSidebar`'s Stop button
	 * click handler.
	 */
	readonly signal?: AbortSignal;

	/**
	 * Per-turn tool-approval resolver (REQ-MPS-045). When set, the adapter
	 * invokes this callback every time the underlying provider asks for
	 * permission to invoke a tool. Resolving `true` allows the invocation;
	 * `false` denies it. Absent or unresolved → adapter falls back to its
	 * provider default (typically deny).
	 *
	 * The decision rule (`'allow-once' | 'always'`) is handled by the UI;
	 * the adapter receives only a boolean.
	 */
	readonly approveTool?: (request: ChatTransportApprovalRequest) => Promise<boolean>;
}

/**
 * Discriminated-union delta emitted by `ChatTransportPort.queryStream()`.
 * Each delta represents one observable event from the underlying transport:
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
 * each stream. Additive variants (the tool-result, the agent
 * progress-list, and citation entries) land in WS-8; this WS-1 rename
 * is shape-preserving for the existing variants.
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
	 * Tool execution result emitted after the underlying tool finished. The
	 * `output` is the (possibly truncated) textual stdout/stderr surface and
	 * `exitCode` is the process exit code when available (null for non-process
	 * tools). REQ-MPS-031 — drives the bash history rows in `StatusPanel`.
	 */
	| {
			readonly type: 'tool-result';
			readonly blockId: string;
			readonly output: string;
			readonly exitCode: number | null;
	  }
	/**
	 * Snapshot of the agent's task-tracker. The variant replaces the entire
	 * task list verbatim on each emission (the model emits the full updated
	 * list rather than diffs). REQ-MPS-030.
	 */
	| { readonly type: 'todo-update'; readonly todos: ReadonlyArray<TodoEntry> }
	/**
	 * Source citation referencing a vault file by path + line range. REQ-MPS-017
	 * — the UI renders these as clickable affordances next to the assistant text.
	 */
	| {
			readonly type: 'citation';
			readonly filePath: string;
			readonly lineStart: number;
			readonly lineEnd: number;
	  }
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
	| { readonly type: 'error'; readonly error: ChatTransportError };

/**
 * Single task-tracker row. The agent emits the complete updated task list
 * on each delta; the UI snapshot replaces verbatim.
 *
 * REQ-MPS-030.
 */
export interface TodoEntry {
	readonly id: string;
	readonly title: string;
	readonly status: 'pending' | 'in-progress' | 'done';
	readonly description: string | null;
}

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
 * `ChatTransportQueryOptions`; kept as a separate interface so the structured
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
 * Narrow port for chat transport adapters (ADR-008, ADR-MPS-001).
 *
 * Renamed from `ChatTransportPort` in WS-1. The interface is provider-agnostic
 * — implementing adapters cover Claude API, Claude CLI, Cursor API, Cursor
 * CLI, and the degraded sentinel.
 *
 * The interface file must not import from `'obsidian'`,
 * `'@anthropic-ai/claude-agent-sdk'`, `'node:child_process'`, or
 * `'node:https'`. Enforced by `tests/domain/ports/ChatTransportPort.imports.test.ts`
 * (NFR-MPS-012).
 *
 * Lifecycle (`startup` / `shutdown`) lives on the sibling
 * `TransportLifecyclePort`; the free-text non-streaming `query()` method
 * is gone — non-streaming callers funnel `queryStream` through
 * `collectStream()` in `src/application/chat/collectStream.ts`.
 *
 * Satisfies REQ-CCS-021, REQ-ASM-001, REQ-MPS-001, REQ-MPS-002.
 */
export interface ChatTransportPort {
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
	 * Stream a fully-assembled prompt to the transport and yield deltas as
	 * they arrive. Never throws — every terminal condition is delivered as a
	 * `done` or `error` delta. The caller cancels via `options.signal`;
	 * cancellation results in an `error` delta (`QUERY_FAILED`) unless the
	 * cancellation races a `done`, in which case `done` wins.
	 *
	 * Implementors MUST:
	 *   - emit at most one `session-id` delta per stream (mirrors the
	 *     one-fire semantics of `ChatTransportQueryOptions.onSessionId`);
	 *   - emit exactly one of `done` or `error` as the final delta;
	 *   - close the iterable after the terminal delta — no further deltas;
	 *   - never throw; surface every error path through `error`.
	 *
	 * Sole canonical streaming method (WP-12). Non-streaming consumers use
	 * `collectStream()` from `@/application/chat/collectStream` to converge
	 * the stream to a `Result<string, ChatTransportError>`.
	 */
	queryStream(prompt: string, options?: ChatTransportStreamOptions): AsyncIterable<StreamDelta>;

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
	 * Never throws. Returns `Result<StructuredCliRawResult, ChatTransportError>`;
	 * envelope parsing happens in the application layer.
	 *
	 * Satisfies REQ-ASM-021, REQ-ASM-049.
	 */
	runStructured?(
		prompt: string,
		options: StructuredCliCallOptions,
	): Promise<Result<StructuredCliRawResult, ChatTransportError>>;
}
