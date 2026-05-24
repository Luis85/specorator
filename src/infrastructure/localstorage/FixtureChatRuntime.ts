import type {
	ChatRuntimePort,
	ProviderId,
	StreamChunk,
	UsageInfo,
	ChatMessage,
	ChatTurnRequest,
	PreparedChatTurn,
	ChatRuntimeQueryOptions,
	ChatRuntimeEnsureReadyOptions,
	Unsubscriber,
} from '@/domain/ports';

/**
 * The canned demo usage DTO — a small, plausible context-window snapshot so the
 * GitHub Pages demo's `usage` chunk carries a believable shape (P1 stores it but
 * renders nothing — NG4).
 */
const FIXTURE_USAGE: UsageInfo = {
	model: 'fixture',
	inputTokens: 24,
	contextWindow: 200000,
	contextTokens: 24,
	percentage: 0,
};

/**
 * Bundled transcript replayed by `FixtureChatRuntime`. A believable RICH reply
 * (SPEC-RR-013, extending SPEC-CC-012): a text intro, a thinking block, an Edit
 * tool call carrying a `structuredPatch` diff, a TodoWrite tool call with a
 * task list, and the canned usage chunk — so the GitHub Pages demo exercises
 * every P2 renderer with no backend. The terminating `done` is appended by the
 * generator, so this constant ends with the `usage` chunk.
 */
const FIXTURE_TRANSCRIPT: readonly StreamChunk[] = [
	{ type: 'text', content: 'This is a canned demo reply streamed from a bundled fixture — ' },
	{ type: 'text', content: 'no backend is contacted on GitHub Pages.' },
	{ type: 'thinking', content: 'Sketching a small edit to demonstrate the diff view.' },
	{
		type: 'tool_use',
		id: 'fixture-edit-1',
		name: 'Edit',
		input: {
			file_path: 'README.md',
			old_string: '# Demo',
			new_string: '# Demo\n\nNow with rich rendering.',
		},
	},
	{
		type: 'tool_result',
		id: 'fixture-edit-1',
		content: 'File edited.',
		toolUseResult: {
			filePath: 'README.md',
			structuredPatch: [
				{
					oldStart: 1,
					oldLines: 1,
					newStart: 1,
					newLines: 3,
					lines: ['-# Demo', '+# Demo', '+', '+Now with rich rendering.'],
				},
			],
		},
	},
	{
		type: 'tool_use',
		id: 'fixture-todo-1',
		name: 'TodoWrite',
		input: {
			todos: [
				{ content: 'Edit the README', status: 'completed', activeForm: 'Editing the README' },
				{ content: 'Preview the demo', status: 'in_progress', activeForm: 'Previewing the demo' },
			],
		},
	},
	{ type: 'tool_result', id: 'fixture-todo-1', content: 'Todos updated.' },
	{ type: 'usage', usage: FIXTURE_USAGE, sessionId: 'fixture-session' },
];

/**
 * GitHub Pages demo `ChatRuntimePort` (SPEC-CC-012).
 *
 * Replays {@link FIXTURE_TRANSCRIPT} (a canned `text…usage…done` reply) as an
 * `async *` generator with the same per-chunk yield discipline as
 * `MockChatRuntime` (`await Promise.resolve()` between chunks) so the demo
 * streams a believable answer token-by-token (REQ-CC-004, NFR-CC-014). No
 * subprocess and no `node:*` — this runs in a plain browser. `ensureReady`
 * always resolves `true`; `cancel()` stops further yields.
 */
export class FixtureChatRuntime implements ChatRuntimePort {
	readonly providerId: ProviderId = 'claude';

	private sessionId: string | null = 'fixture-session';
	private cancelled = false;

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
		for (const chunk of FIXTURE_TRANSCRIPT) {
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
		// Fixture readiness never flips in P1; the unsubscriber is a no-op.
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
