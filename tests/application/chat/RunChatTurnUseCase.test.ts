/**
 * TEST-CC-007 + TEST-CC-013 (U leg) — `RunChatTurnUseCase` orchestration.
 *
 * SPEC-CC-015: the turn orchestrator drives prepareTurn -> ensureReady ->
 * (onAssistantStart) -> for-await dispatch by chunk.type, forwarding chunks to a `ChatTurnSink`.
 * Discrete outcome is `Result<void, ChatTurnError>`; streaming failure is the `error` StreamChunk
 * member forwarded via `onErrorChunk` (NOT a per-chunk Result, ADR-CC-001 §1 / NFR-CC-003).
 *
 * Scenarios covered (RED until T-CC-017):
 *  - dispatch: non-empty turn calls prepareTurn once + starts one query with history; text->onText;
 *    done->onDone + ok
 *  - usage-guard: usage->onUsage; foreign sessionId ignored (EC-11)
 *  - error-chunk: error->onErrorChunk then CONTINUE (a later done still fires) (EC-6)
 *  - not-ready: ensureReady->false => err('not-ready'), NO onAssistantStart, NO query (EC-7)
 *  - cancel: cancel() stops the loop, delegates to runtime.cancel(), returns ok
 *  - generator-throw: unexpected throw => synthetic onErrorChunk + onDone + err('runtime-throw');
 *    never rethrows (EC-13)
 *
 * Traces: TEST-CC-007, TEST-CC-013 (U leg), SPEC-CC-015, REQ-CC-003..005a, 010, 012, NFR-CC-003.
 */
import { describe, it, expect, vi } from 'vitest';
import { RunChatTurnUseCase, ChatTurnError } from '@/application/chat/RunChatTurnUseCase';
import type { ChatTurnSink } from '@/application/chat/RunChatTurnUseCase';
import type {
	ChatRuntimePort,
	RuntimeCapabilities,
	StreamChunk,
	ChatMessage,
	ChatTurnRequest,
	PreparedChatTurn,
	UsageInfo,
} from '@/domain/ports';

function makeSink(): ChatTurnSink & {
	calls: string[];
	texts: string[];
	errors: string[];
	usages: UsageInfo[];
} {
	const calls: string[] = [];
	const texts: string[] = [];
	const errors: string[] = [];
	const usages: UsageInfo[] = [];
	return {
		calls,
		texts,
		errors,
		usages,
		onAssistantStart() {
			calls.push('start');
		},
		onText(content: string) {
			calls.push('text');
			texts.push(content);
		},
		onUsage(usage: UsageInfo) {
			calls.push('usage');
			usages.push(usage);
		},
		onErrorChunk(content: string) {
			calls.push('error');
			errors.push(content);
		},
		onDone() {
			calls.push('done');
		},
		// P2 legs (SPEC-RR-019) — present so this P1 fixture satisfies the grown `ChatTurnSink`
		// interface; the P1 scenarios never exercise them (the P2 dispatch is covered by
		// RunChatTurnUseCase.rr.test.ts). No assertion here changes.
		onToolUse() {},
		onToolResult() {},
		onToolOutput() {},
		onThinking() {},
		onSubagentToolUse() {},
		onSubagentToolResult() {},
		onAsyncSubagentResult() {},
		onContextCompacted() {},
		onNotice() {},
	};
}

const USAGE: UsageInfo = { inputTokens: 1, contextWindow: 100, contextTokens: 10, percentage: 10 };

/**
 * Fully controllable test runtime: scripts the exact chunk sequence, lets a test set the
 * "current" session id (for the usage guard), can throw mid-generator, and records cancel().
 */
class ScriptedRuntime implements ChatRuntimePort {
	readonly providerId = 'claude' as const;
	ready = true;
	cancelled = false;
	queryStarts = 0;
	lastHistory: ChatMessage[] | undefined;
	prepareCalls = 0;

	constructor(
		private readonly script: StreamChunk[],
		private readonly sessionId: string | null = 'session-1',
		private readonly throwAfter = -1, // index after which the generator throws (-1 = never)
	) {}

	prepareTurn(request: ChatTurnRequest): PreparedChatTurn {
		this.prepareCalls += 1;
		return {
			request,
			persistedContent: request.text,
			prompt: request.text,
			isCompact: false,
			mcpMentions: new Set<string>(),
		};
	}

	ensureReady(): Promise<boolean> {
		return Promise.resolve(this.ready);
	}

	async *query(
		_turn: PreparedChatTurn,
		conversationHistory?: ChatMessage[],
	): AsyncGenerator<StreamChunk> {
		this.queryStarts += 1;
		this.lastHistory = conversationHistory;
		let i = 0;
		for (const chunk of this.script) {
			await Promise.resolve();
			if (this.cancelled) return;
			if (this.throwAfter === i) throw new Error('boom');
			yield chunk;
			i += 1;
		}
	}

	cancel(): void {
		this.cancelled = true;
	}

	getSessionId(): string | null {
		return this.sessionId;
	}

	resetSession(): void {
		/* no-op for the test */
	}

	onReadyStateChange(): () => void {
		return () => undefined;
	}

	isReady(): boolean {
		return this.ready;
	}

	// P3 additive members (SPEC-TS-003) — no-op stubs to satisfy the grown port.
	resumeSession(): void {
		/* no-op for the test */
	}

	setResumeCheckpoint(): void {
		/* no-op for the test */
	}

	getCapabilities(): RuntimeCapabilities {
		return {
			supportsFork: true,
			supportsRewind: true,
			supportsPlanMode: true,
			supportsInlineResponse: true,
		};
	}

	// P4 additive members (SPEC-CP-002) — no-op stubs to satisfy the grown port.
	setAskUserQuestionCallback(): void {
		/* no-op for the test */
	}

	setExitPlanModeCallback(): void {
		/* no-op for the test */
	}

	setApprovalCallback(): void {
		/* no-op for the test */
	}
}

const REQUEST: ChatTurnRequest = { text: 'hello' };
const HISTORY: ChatMessage[] = [{ id: 'u1', role: 'user', content: 'hello', timestamp: 1 }];

describe('RunChatTurnUseCase (TEST-CC-007 / TEST-CC-013 U leg)', () => {
	it('dispatches a non-empty turn: prepareTurn once, one query with history, text->onText, done->onDone, ok', async () => {
		const runtime = new ScriptedRuntime([
			{ type: 'text', content: 'Hel' },
			{ type: 'text', content: 'lo' },
			{ type: 'done' },
		]);
		const useCase = new RunChatTurnUseCase(runtime);
		const sink = makeSink();

		const result = await useCase.run({ request: REQUEST, history: HISTORY }, sink);

		expect(result.ok).toBe(true);
		expect(runtime.prepareCalls).toBe(1);
		expect(runtime.queryStarts).toBe(1);
		expect(runtime.lastHistory).toBe(HISTORY);
		expect(sink.calls).toEqual(['start', 'text', 'text', 'done']);
		expect(sink.texts.join('')).toBe('Hello');
	});

	it('forwards a usage chunk to onUsage when sessionId matches the runtime', async () => {
		const runtime = new ScriptedRuntime(
			[{ type: 'usage', usage: USAGE, sessionId: 'session-1' }, { type: 'done' }],
			'session-1',
		);
		const sink = makeSink();
		await new RunChatTurnUseCase(runtime).run({ request: REQUEST, history: HISTORY }, sink);
		expect(sink.usages).toEqual([USAGE]);
	});

	it('ignores a usage chunk whose sessionId is foreign (EC-11)', async () => {
		const runtime = new ScriptedRuntime(
			[{ type: 'usage', usage: USAGE, sessionId: 'other-session' }, { type: 'done' }],
			'session-1',
		);
		const sink = makeSink();
		await new RunChatTurnUseCase(runtime).run({ request: REQUEST, history: HISTORY }, sink);
		expect(sink.usages).toEqual([]);
		expect(sink.calls).toEqual(['start', 'done']);
	});

	it('forwards usage when sessionId is null/undefined (current session)', async () => {
		const runtime = new ScriptedRuntime([{ type: 'usage', usage: USAGE }, { type: 'done' }]);
		const sink = makeSink();
		await new RunChatTurnUseCase(runtime).run({ request: REQUEST, history: HISTORY }, sink);
		expect(sink.usages).toEqual([USAGE]);
	});

	it('forwards an error chunk to onErrorChunk then CONTINUES to done (EC-6)', async () => {
		const runtime = new ScriptedRuntime([
			{ type: 'text', content: 'partial' },
			{ type: 'error', content: 'rate limited' },
			{ type: 'done' },
		]);
		const sink = makeSink();
		const result = await new RunChatTurnUseCase(runtime).run(
			{ request: REQUEST, history: HISTORY },
			sink,
		);
		expect(result.ok).toBe(true);
		expect(sink.errors).toEqual(['rate limited']);
		expect(sink.calls).toEqual(['start', 'text', 'error', 'done']);
	});

	it('returns err("not-ready") with NO onAssistantStart and NO query when ensureReady is false (EC-7)', async () => {
		const runtime = new ScriptedRuntime([{ type: 'done' }]);
		runtime.ready = false;
		const sink = makeSink();

		const result = await new RunChatTurnUseCase(runtime).run(
			{ request: REQUEST, history: HISTORY },
			sink,
		);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toBeInstanceOf(ChatTurnError);
			expect(result.error.kind).toBe('not-ready');
		}
		expect(runtime.queryStarts).toBe(0);
		expect(sink.calls).toEqual([]);
	});

	it('cancel() delegates to runtime.cancel(), stops the loop, and returns ok', async () => {
		const runtime = new ScriptedRuntime([
			{ type: 'text', content: 'a' },
			{ type: 'text', content: 'b' },
			{ type: 'text', content: 'c' },
			{ type: 'done' },
		]);
		const useCase = new RunChatTurnUseCase(runtime);
		const sink = makeSink();

		const promise = useCase.run({ request: REQUEST, history: HISTORY }, sink);
		useCase.cancel();
		const result = await promise;

		expect(runtime.cancelled).toBe(true);
		expect(result.ok).toBe(true);
		// done is never reached because the generator returns early on cancel.
		expect(sink.calls).not.toContain('done');
	});

	it('catches an unexpected generator throw: synthetic onErrorChunk + onDone, err("runtime-throw"), never rethrows (EC-13)', async () => {
		const runtime = new ScriptedRuntime(
			[
				{ type: 'text', content: 'partial' },
				{ type: 'text', content: 'more' },
			],
			'session-1',
			1, // throw after yielding index 0
		);
		const useCase = new RunChatTurnUseCase(runtime);
		const sink = makeSink();

		const result = await useCase.run({ request: REQUEST, history: HISTORY }, sink);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toBeInstanceOf(ChatTurnError);
			expect(result.error.kind).toBe('runtime-throw');
		}
		// Synthetic error then done were forwarded; the first text still landed.
		expect(sink.calls).toEqual(['start', 'text', 'error', 'done']);
		expect(sink.errors).toHaveLength(1);
	});

	it('passes queryOptions through to the runtime query', async () => {
		const runtime = new ScriptedRuntime([{ type: 'done' }]);
		const querySpy = vi.spyOn(runtime, 'query');
		const useCase = new RunChatTurnUseCase(runtime);
		await useCase.run(
			{ request: REQUEST, history: HISTORY, queryOptions: { model: 'opus' } },
			makeSink(),
		);
		expect(querySpy).toHaveBeenCalledWith(expect.anything(), HISTORY, { model: 'opus' });
	});

	it('finalises an empty assistant turn: done with zero text chunks still calls onDone + ok (EC-5)', async () => {
		const runtime = new ScriptedRuntime([{ type: 'done' }]);
		const sink = makeSink();
		const result = await new RunChatTurnUseCase(runtime).run(
			{ request: REQUEST, history: HISTORY },
			sink,
		);
		expect(result.ok).toBe(true);
		expect(sink.calls).toEqual(['start', 'done']);
	});
});
