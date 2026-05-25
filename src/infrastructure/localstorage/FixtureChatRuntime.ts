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
	RuntimeCapabilities,
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
 * task list, a Task subagent (spawn → nested tool use/result → async result),
 * and the canned usage chunk — so the GitHub Pages demo exercises every P2
 * renderer (incl. `SubagentBlock`, CLAR-RR-008) with no backend. The terminating
 * `done` is appended by the generator, so this constant ends with the `usage` chunk.
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
	// A Task subagent: the spawn seeds the SubagentInfo + a top-level `subagent`
	// block (CLAR-RR-008), a nested tool call/result correlated by the spawn id,
	// then the async completion so the demo renders a SubagentBlock.
	{
		type: 'tool_use',
		id: 'fixture-agent-1',
		name: 'Task',
		input: { description: 'review the README', prompt: 'confirm the rich-rendering note reads well' },
	},
	{
		type: 'subagent_tool_use',
		subagentId: 'fixture-agent-1',
		id: 'fixture-sub-read-1',
		name: 'Read',
		input: { file_path: 'README.md' },
	},
	{
		type: 'subagent_tool_result',
		subagentId: 'fixture-agent-1',
		id: 'fixture-sub-read-1',
		content: '# Demo\n\nNow with rich rendering.',
	},
	{
		type: 'async_subagent_result',
		agentId: 'fixture-agent-1',
		status: 'completed',
		result: 'The rich-rendering note reads well.',
	},
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
	// P3 (SPEC-TS-009): recorded-no-op session ops (mirrors MockChatRuntime).
	private resumedSessionId: string | null = null;
	private resumeCheckpoint: string | null = null;
	private lastForceColdStart = false;

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
		queryOptions?: ChatRuntimeQueryOptions,
	): AsyncGenerator<StreamChunk> {
		this.cancelled = false;
		this.lastForceColdStart = queryOptions?.forceColdStart === true;
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

	// ── P3 additive members (SPEC-TS-003/009) ──────────────────────────────────
	resumeSession(sessionId: string): void {
		this.resumedSessionId = sessionId;
		this.sessionId = sessionId.length > 0 ? sessionId : this.sessionId;
	}

	setResumeCheckpoint(assistantMessageId: string): void {
		this.resumeCheckpoint = assistantMessageId;
	}

	getCapabilities(): RuntimeCapabilities {
		return { supportsFork: true, supportsRewind: true };
	}

	/** Test accessor: the last session id bound via {@link resumeSession}. */
	getResumedSessionId(): string | null {
		return this.resumedSessionId;
	}

	/** Test accessor: the last checkpoint set via {@link setResumeCheckpoint}. */
	getResumeCheckpoint(): string | null {
		return this.resumeCheckpoint;
	}

	/** Test accessor: whether the last `query` ran with `forceColdStart`. */
	getLastForceColdStart(): boolean {
		return this.lastForceColdStart;
	}

	/** Opaque read of the cancel flag so the streaming loop checks live state. */
	private isCancelled(): boolean {
		return this.cancelled;
	}
}
