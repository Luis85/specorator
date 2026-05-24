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

/**
 * The default scripted RICH turn (SPEC-RR-013). Drives every P2 renderer in
 * `npm run dev` with no subprocess: a text intro, a thinking block, a Read tool
 * call, a Write tool call carrying a `structuredPatch` (+3/−1), a TodoWrite tool
 * call with a todos list, a sync subagent (nested tool use + result), an async
 * subagent result, and a usage chunk. The terminating `done` is appended by the
 * generator. Each entry keeps its own per-chunk yield boundary (NFR-RR-014).
 *
 * The script stays injectable per test — `new MockChatRuntime([...customChunks])`
 * overrides this default (the QA stage scripts the exact sequence each test needs).
 */
const DEFAULT_SCRIPT: MockChatScriptEntry[] = [
	{ type: 'assistant_message_start' },
	{ type: 'text', content: 'Working on it. ' },
	{ type: 'thinking', content: 'Considering the file changes needed.' },
	// Read tool call.
	{ type: 'tool_use', id: 'mock-read-1', name: 'Read', input: { file_path: 'src/example.ts' } },
	{ type: 'tool_result', id: 'mock-read-1', content: 'export const x = 1;\n' },
	// Write tool call with a structuredPatch (+3 inserts, −1 delete).
	{
		type: 'tool_use',
		id: 'mock-write-1',
		name: 'Write',
		input: { file_path: 'src/example.ts', content: 'export const x = 2;\n' },
	},
	{
		type: 'tool_result',
		id: 'mock-write-1',
		content: 'File written.',
		toolUseResult: {
			filePath: 'src/example.ts',
			structuredPatch: [
				{
					oldStart: 1,
					oldLines: 1,
					newStart: 1,
					newLines: 3,
					lines: [
						'-export const x = 1;',
						'+export const x = 2;',
						'+// updated by the mock runtime',
						'+export const y = 3;',
					],
				},
			],
		},
	},
	// TodoWrite tool call with a todos list.
	{
		type: 'tool_use',
		id: 'mock-todo-1',
		name: 'TodoWrite',
		input: {
			todos: [
				{ content: 'Read the file', status: 'completed', activeForm: 'Reading the file' },
				{ content: 'Apply the edit', status: 'in_progress', activeForm: 'Applying the edit' },
				{ content: 'Run the tests', status: 'pending', activeForm: 'Running the tests' },
			],
		},
	},
	{ type: 'tool_result', id: 'mock-todo-1', content: 'Todos updated.' },
	// A subagent: the Task spawn seeds the SubagentInfo + a top-level `subagent`
	// block (CLAR-RR-008), then a nested tool call correlated by the spawn id, then
	// an async completion. Without the spawn the store never seeds the subagent.
	{
		type: 'tool_use',
		id: 'mock-agent-1',
		name: 'Task',
		input: { description: 'search the codebase', prompt: 'find every export const' },
	},
	{
		type: 'subagent_tool_use',
		subagentId: 'mock-agent-1',
		id: 'mock-sub-grep-1',
		name: 'Grep',
		input: { pattern: 'export const' },
	},
	{
		type: 'subagent_tool_result',
		subagentId: 'mock-agent-1',
		id: 'mock-sub-grep-1',
		content: 'src/example.ts:1',
	},
	{
		type: 'async_subagent_result',
		agentId: 'mock-agent-1',
		status: 'completed',
		result: 'Found one match.',
	},
	{ type: 'text', content: 'Done — applied the change and updated the task list.' },
	{
		type: 'usage',
		usage: {
			model: 'mock',
			inputTokens: 42,
			contextWindow: 200000,
			contextTokens: 42,
			percentage: 0,
		},
		sessionId: 'mock-session',
	},
];

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
