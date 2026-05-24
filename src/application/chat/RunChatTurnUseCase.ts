import type {
	ChatRuntimePort,
	ChatMessage,
	ChatTurnRequest,
	ChatRuntimeQueryOptions,
	StreamChunk,
	UsageInfo,
} from '@/domain/ports';
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
 * Side-effect sink the store provides; the use case never touches the store directly (SPEC-CC-015).
 */
export interface ChatTurnSink {
	/** Create the empty live assistant message. */
	onAssistantStart(): void;
	/** Append incremental content to the live message (REQ-CC-004). */
	onText(content: string): void;
	/** Store the usage DTO (REQ-CC-005a); no content mutation. */
	onUsage(usage: UsageInfo): void;
	/** Render a streaming error inline (REQ-CC-012). */
	onErrorChunk(content: string): void;
	/** Finalise the live message -> idle (REQ-CC-005). */
	onDone(): void;
}

const NOT_READY_MESSAGE =
	'The chat backend is not ready. Check that the Claude CLI is installed and you are logged in.';
const RUNTIME_THROW_MESSAGE = 'The chat turn ended unexpectedly. Please try again.';

export class RunChatTurnUseCase {
	private readonly runtime: ChatRuntimePort;

	constructor(runtime: ChatRuntimePort) {
		this.runtime = runtime;
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

	/** Apply one chunk to the sink. Returns `true` when the turn is finalised (`done`). */
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
				sink.onDone();
				return true;
			default:
				// `assistant_message_start` is a P1 no-op (the live message already exists); other
				// P2+ members are ignored (forward-compatible default branch).
				return false;
		}
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
