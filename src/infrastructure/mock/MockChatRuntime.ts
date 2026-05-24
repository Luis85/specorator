import type {
	ChatRuntimePort,
	ProviderId,
	StreamChunk,
	ChatMessage,
	ChatTurnRequest,
	PreparedChatTurn,
	ChatRuntimeQueryOptions,
	ChatRuntimeEnsureReadyOptions,
	Unsubscriber,
} from '@/domain/ports';

/**
 * A script entry: a bare string (shorthand for a `{type:'text'}` chunk) or any
 * `StreamChunk`. The terminating `done` is appended automatically, so scripts
 * need only describe the `text`/`error`/`usage` content.
 */
export type MockChatScriptEntry = string | StreamChunk;

const DEFAULT_SCRIPT: MockChatScriptEntry[] = ['Hello', ' from', ' the', ' mock', ' runtime.'];

function toChunk(entry: MockChatScriptEntry): StreamChunk {
	return typeof entry === 'string' ? { type: 'text', content: entry } : entry;
}

/**
 * Scripted in-memory `ChatRuntimePort` for unit tests and `npm run dev` (SPEC-CC-011).
 *
 * No subprocess. `query` is an `async *` generator yielding the scripted chunks with a
 * per-chunk yield boundary (`await Promise.resolve()` between chunks) so accumulation is
 * observable per tick (REQ-CC-004, NFR-CC-014). The generator always terminates with a
 * single `done` (unless cancelled first). `cancel()` stops further yields.
 */
export class MockChatRuntime implements ChatRuntimePort {
	readonly providerId: ProviderId = 'claude';

	private readonly script: StreamChunk[];
	private sessionId: string | null = 'mock-session';
	private cancelled = false;

	constructor(script: MockChatScriptEntry[] = DEFAULT_SCRIPT) {
		// Drop any trailing `done` — the generator owns the terminator.
		const normalized = script.map(toChunk);
		this.script =
			normalized.length > 0 && normalized[normalized.length - 1].type === 'done'
				? normalized.slice(0, -1)
				: normalized;
	}

	prepareTurn(request: ChatTurnRequest): PreparedChatTurn {
		return {
			request,
			persistedContent: request.text,
			prompt: request.text,
			isCompact: false,
			mcpMentions: new Set<string>(),
		};
	}

	ensureReady(_options?: ChatRuntimeEnsureReadyOptions): Promise<boolean> {
		return Promise.resolve(true);
	}

	async *query(
		_turn: PreparedChatTurn,
		_conversationHistory?: ChatMessage[],
		_queryOptions?: ChatRuntimeQueryOptions,
	): AsyncGenerator<StreamChunk> {
		this.cancelled = false;
		for (const chunk of this.script) {
			// Per-chunk yield boundary: each chunk lands on its own resumed tick.
			await Promise.resolve();
			if (this.isCancelled()) return;
			yield chunk;
		}
		await Promise.resolve();
		if (this.isCancelled()) return;
		yield { type: 'done' };
	}

	cancel(): void {
		this.cancelled = true;
	}

	getSessionId(): string | null {
		return this.sessionId;
	}

	resetSession(): void {
		this.sessionId = null;
	}

	onReadyStateChange(_listener: (ready: boolean) => void): Unsubscriber {
		// Mock readiness never flips in P1; the unsubscriber is a no-op.
		return () => undefined;
	}

	isReady(): boolean {
		return true;
	}

	/** Opaque read of the cancel flag so the streaming loop checks live state. */
	private isCancelled(): boolean {
		return this.cancelled;
	}
}
