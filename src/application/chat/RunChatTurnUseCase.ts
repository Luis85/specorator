import type {
	ChatRuntimePort,
	ChatMessage,
	ChatTurnRequest,
	ChatRuntimeQueryOptions,
	StreamChunk,
	UsageInfo,
	LoggerPort,
} from '@/domain/ports';
import type { ToolUseResult } from '@/domain/chat/diff/ToolUseResult';
import { type Result, ok, err } from '@/domain/shared/Result';
import { tryAsync } from '@/domain/shared/tryAsync';

/**
 * RunChatTurnUseCase — the P1 turn orchestrator (SPEC-CC-015).
 *
 * ## Result / streaming-error boundary (ADR-CC-001 §1, NFR-CC-003)
 *
 * Two error conventions coexist here by design:
 *
 *  - The **discrete** outcome of a turn is a `Result<void, ChatTurnError>` (ADR-004): `ok` for a
 *    completed-or-cancelled turn, `err` for a start failure (`'not-ready'`) or an unexpected
 *    generator fault (`'runtime-throw'`).
 *  - **Per-chunk streaming failures are NOT `Result`** — they arrive as the `{type:'error'}`
 *    `StreamChunk` member and are forwarded to `sink.onErrorChunk` to be rendered inline. The
 *    stream continues (a `done` may still follow). The runtime never throws across the port for
 *    an expected failure; an *unexpected* throw is caught here and mapped to a synthetic
 *    `error` + `done` plus an `err('runtime-throw')` — it is NEVER rethrown across this boundary.
 *
 * The use case holds no UI state: it drives the `ChatTurnSink` the store supplies.
 */
export class ChatTurnError extends Error {
	constructor(
		public readonly kind: 'not-ready' | 'runtime-throw',
		message: string,
	) {
		super(message);
		this.name = 'ChatTurnError';
	}
}

export interface RunChatTurnInput {
	/** The raw user turn `{ text, currentNotePath? }`. */
	request: ChatTurnRequest;
	/** Conversation BEFORE this turn's assistant reply (includes the just-appended user message). */
	history: ChatMessage[];
	/** Optional per-turn query options `{ model? }`. */
	queryOptions?: ChatRuntimeQueryOptions;
}

/**
 * Side-effect sink the store provides; the use case never touches the store directly
 * (SPEC-CC-015 + SPEC-RR-019). Every leg is `void`-returning and side-effecting on the store only;
 * the store guards each leg (SPEC-RR-020) so no leg throws across the port. The use case calls a
 * leg exactly once per matching chunk.
 */
export interface ChatTurnSink {
	// ---- P1 legs (SPEC-CC-015) — UNCHANGED ----
	/** Create the empty live assistant message. */
	onAssistantStart(): void;
	/** Append incremental content to the live message + extend the trailing text block (REQ-CC-004/RR-011). */
	onText(content: string): void;
	/** Store the usage DTO (REQ-CC-005a); no content mutation. */
	onUsage(usage: UsageInfo): void;
	/** Render a streaming error inline (REQ-CC-012). */
	onErrorChunk(content: string): void;
	/**
	 * Finalise the live message -> idle (REQ-CC-005). `assistantMessageId` (P3,
	 * R-TS-001) is the runtime's per-turn id when the stream surfaced one; the
	 * store stamps it on the live assistant message so rewind eligibility renders
	 * (REQ-TS-019).
	 */
	onDone(assistantMessageId?: string): void;
	// ---- P2 additive legs (SPEC-RR-019) ----
	/** Create a running `ToolCall` + push a `tool_use` content block (REQ-RR-002). */
	onToolUse(id: string, name: string, input: Record<string, unknown>): void;
	/** Set a tool's result + status; the store computes the Write/Edit diff (REQ-RR-003/026). */
	onToolResult(id: string, content: string, isError: boolean, result?: ToolUseResult): void;
	/** Append interim output to a running tool; no new block (REQ-RR-003). */
	onToolOutput(id: string, content: string): void;
	/** Accumulate / push the open thinking block in stream order (REQ-RR-004). */
	onThinking(content: string): void;
	/** Route a nested tool-use to its subagent; no top-level block (REQ-RR-006). */
	onSubagentToolUse(subagentId: string, id: string, name: string, input: Record<string, unknown>): void;
	/** Route a nested tool-result to its subagent (REQ-RR-006). */
	onSubagentToolResult(
		subagentId: string,
		id: string,
		content: string,
		isError: boolean,
		result?: ToolUseResult,
	): void;
	/** Set the subagent's async status/result (REQ-RR-006/021a). */
	onAsyncSubagentResult(agentId: string, status: 'completed' | 'error', result?: string): void;
	/** Push a render-only context-compacted block (NG1). */
	onContextCompacted(): void;
	/** Render a non-blocking notice; no thread machinery (render-only). */
	onNotice(content: string, level?: 'info' | 'warning'): void;
}

const NOT_READY_MESSAGE =
	'The chat backend is not ready. Check that the Claude CLI is installed and you are logged in.';
const RUNTIME_THROW_MESSAGE = 'The chat turn ended unexpectedly. Please try again.';

export class RunChatTurnUseCase {
	private readonly runtime: ChatRuntimePort;
	private readonly logger: LoggerPort | undefined;

	/**
	 * @param runtime the chat runtime port (the only required dependency, ADR-CC-001 §5).
	 * @param logger optional `LoggerPort` — when present, a `debug` is logged per dispatched P2
	 *   chunk (type + id/subagentId/agentId, no content — §8). Optional so the P1 instantiation
	 *   (`new RunChatTurnUseCase(runtime)`) stays valid; observability is additive, not behavioural.
	 */
	constructor(runtime: ChatRuntimePort, logger?: LoggerPort) {
		this.runtime = runtime;
		this.logger = logger;
	}

	/**
	 * Orchestrate one turn: `prepareTurn -> ensureReady -> (onAssistantStart) -> query` dispatch.
	 * Returns `ok` for a completed-or-cancelled turn, `err` for not-ready / unexpected-throw.
	 */
	async run(input: RunChatTurnInput, sink: ChatTurnSink): Promise<Result<void, ChatTurnError>> {
		const prepared = this.runtime.prepareTurn(input.request);

		const ready = await this.runtime.ensureReady();
		if (!ready) {
			// EC-7: start-fail. No live assistant message; no query started.
			return err(new ChatTurnError('not-ready', NOT_READY_MESSAGE));
		}

		sink.onAssistantStart();

		// Drain the stream via `tryAsync` so an unexpected generator throw becomes a Result rather
		// than crossing the boundary (NFR-CC-003). Expected streaming failures arrive as `error`
		// chunks inside the loop and never reject.
		const drained = await tryAsync(() => this.drainStream(prepared, input, sink));
		if (drained.ok) return ok(undefined);

		// EC-13: synthesise an inline error + finalise, then report the discrete fault.
		sink.onErrorChunk(RUNTIME_THROW_MESSAGE);
		sink.onDone();
		return err(new ChatTurnError('runtime-throw', drained.error.message));
	}

	/** Iterate the runtime stream, dispatching each chunk to the sink (SPEC-CC-015 §3). */
	private async drainStream(
		prepared: ReturnType<ChatRuntimePort['prepareTurn']>,
		input: RunChatTurnInput,
		sink: ChatTurnSink,
	): Promise<void> {
		for await (const chunk of this.runtime.query(prepared, input.history, input.queryOptions)) {
			if (this.dispatchChunk(chunk, sink)) return; // `done` ends the turn.
		}
		// Generator returned without an explicit `done` (e.g. cancel stopped it early).
	}

	/**
	 * Apply one chunk to the sink. Returns `true` when the turn is finalised (`done`).
	 *
	 * The P1 streaming-error boundary is unchanged (ADR-CC-001 §1): an `error` chunk is forwarded
	 * inline via `onErrorChunk` and the stream keeps iterating (no per-chunk `Result`, no throw). P2
	 * chunk members are routed by `dispatchP2Chunk`; the forward-compatible `default` branch still
	 * ignores any unhandled future member so the turn continues and `done` finalises (REQ-RR-007,
	 * EC-RR-14).
	 */
	private dispatchChunk(chunk: StreamChunk, sink: ChatTurnSink): boolean {
		switch (chunk.type) {
			case 'text':
				sink.onText(chunk.content);
				return false;
			case 'usage':
				// EC-11 session guard: ignore usage tagged for a foreign session.
				if (!this.isForeignSession(chunk.sessionId)) sink.onUsage(chunk.usage);
				return false;
			case 'error':
				// EC-6: forward inline, then keep iterating (a `done` may still follow).
				sink.onErrorChunk(chunk.content);
				return false;
			case 'done':
				// P3 (R-TS-001): forward the per-turn assistant id when the stream carried one.
				sink.onDone(chunk.assistantMessageId);
				return true;
			default:
				// P2 rich members route here; `assistant_message_start` / `user_message_start` and any
				// unhandled future member fall through to the forward-compatible no-op (REQ-RR-007).
				this.dispatchP2Chunk(chunk, sink);
				return false;
		}
	}

	/**
	 * Forward a P2 rich chunk to its matching `ChatTurnSink` leg (SPEC-RR-018). Out-of-order /
	 * unknown ids are the SINK's responsibility (the store buffers/ignores, EC-RR-1/2/9); the use
	 * case just forwards. Anything not matched here (incl. P1-handled or unknown future members) is
	 * a no-op. A `debug` is logged per dispatched chunk (§8, no content).
	 */
	private dispatchP2Chunk(chunk: StreamChunk, sink: ChatTurnSink): void {
		if (this.dispatchToolChunk(chunk, sink)) return;
		this.dispatchSubagentOrMiscChunk(chunk, sink);
	}

	/** Tool-scoped P2 legs. Returns `true` when the chunk was a tool member it handled. */
	private dispatchToolChunk(chunk: StreamChunk, sink: ChatTurnSink): boolean {
		switch (chunk.type) {
			case 'tool_use':
				this.logP2('tool_use', { id: chunk.id });
				sink.onToolUse(chunk.id, chunk.name, chunk.input);
				return true;
			case 'tool_result':
				this.logP2('tool_result', { id: chunk.id });
				sink.onToolResult(chunk.id, chunk.content, chunk.isError ?? false, chunk.toolUseResult);
				return true;
			case 'tool_output':
				this.logP2('tool_output', { id: chunk.id });
				sink.onToolOutput(chunk.id, chunk.content);
				return true;
			case 'thinking':
				this.logP2('thinking');
				sink.onThinking(chunk.content);
				return true;
			default:
				return false;
		}
	}

	/** Subagent-scoped + render-only P2 legs (SPEC-RR-018). */
	private dispatchSubagentOrMiscChunk(chunk: StreamChunk, sink: ChatTurnSink): void {
		switch (chunk.type) {
			case 'subagent_tool_use':
				this.logP2('subagent_tool_use', { subagentId: chunk.subagentId, id: chunk.id });
				sink.onSubagentToolUse(chunk.subagentId, chunk.id, chunk.name, chunk.input);
				return;
			case 'subagent_tool_result':
				this.logP2('subagent_tool_result', { subagentId: chunk.subagentId, id: chunk.id });
				sink.onSubagentToolResult(
					chunk.subagentId,
					chunk.id,
					chunk.content,
					chunk.isError ?? false,
					chunk.toolUseResult,
				);
				return;
			case 'async_subagent_result':
				this.logP2('async_subagent_result', { agentId: chunk.agentId });
				sink.onAsyncSubagentResult(chunk.agentId, chunk.status, chunk.result);
				return;
			case 'context_compacted':
				this.logP2('context_compacted');
				sink.onContextCompacted();
				return;
			case 'notice':
				this.logP2('notice');
				sink.onNotice(chunk.content, chunk.level);
				return;
			default:
				// `assistant_message_start` / `user_message_start` / unknown future member: no-op.
				return;
		}
	}

	/** Console-only `debug` per dispatched P2 chunk (§8) — type + ids, never content (NFR-RR-010). */
	private logP2(type: StreamChunk['type'], ids?: Record<string, unknown>): void {
		this.logger?.debug('chat-turn: dispatch P2 chunk', { type, ...ids });
	}

	private isForeignSession(sessionId: string | null | undefined): boolean {
		if (sessionId === null || sessionId === undefined) return false;
		return sessionId !== this.runtime.getSessionId();
	}

	/** Abort the in-flight turn; the `for await` ends and `run` resolves `ok` (SPEC-CC-015 §5). */
	cancel(): void {
		this.runtime.cancel();
	}
}
