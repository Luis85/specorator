/**
 * TEST-RR-005/006/007/009/012/027 (U leg) — `RunChatTurnUseCase.dispatchChunk`
 * P2 handlers + the new `ChatTurnSink` P2 legs.
 *
 * SPEC-RR-018/019: dispatchChunk gains a case per P2 chunk member, each routing
 * to a matching additive sink leg; the forward-compatible default branch and the
 * P1 legs (onAssistantStart/onText/onUsage/onErrorChunk/onDone) are preserved;
 * the streaming-error boundary stays the {type:'error'} chunk (no per-chunk
 * Result, no throw across the port — ADR-CC-001 §1). A runtime throw still
 * synthesises error+done.
 *
 * Traces: TEST-RR-005/006/007/009/012/027, SPEC-RR-018/019, REQ-RR-001..007,
 * NFR-RR-003, EC-RR-14.
 */
import { describe, it, expect } from 'vitest';
import { RunChatTurnUseCase } from '@/application/chat/RunChatTurnUseCase';
import type { ChatTurnSink } from '@/application/chat/RunChatTurnUseCase';
import type {
	ChatRuntimePort,
	RuntimeCapabilities,
	ToolbarCapabilities,
	StreamChunk,
	ChatMessage,
	ChatTurnRequest,
	PreparedChatTurn,
	UsageInfo,
} from '@/domain/ports';
import type { ToolUseResult } from '@/domain/chat/diff/ToolUseResult';

interface Recorder {
	calls: string[];
	sink: ChatTurnSink;
	last: Record<string, unknown[]>;
}

function makeRecorder(): Recorder {
	const calls: string[] = [];
	const last: Record<string, unknown[]> = {};
	const rec =
		(name: string) =>
		(...args: unknown[]): void => {
			calls.push(name);
			last[name] = args;
		};
	const sink: ChatTurnSink = {
		onAssistantStart: rec('start'),
		onText: rec('text'),
		onUsage: rec('usage'),
		onErrorChunk: rec('error'),
		onDone: rec('done'),
		onToolUse: rec('toolUse'),
		onToolResult: rec('toolResult'),
		onToolOutput: rec('toolOutput'),
		onThinking: rec('thinking'),
		onSubagentToolUse: rec('subagentToolUse'),
		onSubagentToolResult: rec('subagentToolResult'),
		onAsyncSubagentResult: rec('asyncSubagentResult'),
		onContextCompacted: rec('contextCompacted'),
		onNotice: rec('notice'),
	};
	return { calls, sink, last };
}

class ScriptedRuntime implements ChatRuntimePort {
	readonly providerId = 'claude' as const;
	ready = true;
	cancelled = false;
	constructor(
		private readonly script: StreamChunk[],
		private readonly throwAfter = -1,
	) {}
	prepareTurn(request: ChatTurnRequest): PreparedChatTurn {
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
	async *query(): AsyncGenerator<StreamChunk> {
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
		return 'session-1';
	}
	resetSession(): void {}
	onReadyStateChange(): () => void {
		return () => undefined;
	}
	isReady(): boolean {
		return this.ready;
	}
	// P3 additive members (SPEC-TS-003) — no-op stubs to satisfy the grown port.
	resumeSession(): void {}
	setResumeCheckpoint(): void {}
	getCapabilities(): RuntimeCapabilities {
		return {
			supportsFork: true,
			supportsRewind: true,
			supportsPlanMode: true,
			supportsInlineResponse: true,
		};
	}
	// P6 additive member (SPEC-TC-005) — Claude-shaped stub to satisfy the grown port.
	// P7 (SPEC-AS-006b): the P6 `'default'` maps to the live `'normal'`.
	getToolbarCapabilities(): ToolbarCapabilities {
		return {
			supportsMcpTools: false,
			reasoningControl: 'effort',
			hasServiceTier: false,
			hasModeToggle: true,
			permissionMode: 'normal',
		};
	}
	// P4 additive members (SPEC-CP-002) — no-op stubs to satisfy the grown port.
	setAskUserQuestionCallback(): void {}
	setExitPlanModeCallback(): void {}
	setApprovalCallback(): void {}
}

const REQUEST: ChatTurnRequest = { text: 'hi' };
const HISTORY: ChatMessage[] = [{ id: 'u1', role: 'user', content: 'hi', timestamp: 1 }];
const USAGE: UsageInfo = { inputTokens: 1, contextWindow: 100, contextTokens: 10, percentage: 10 };
const PATCH: ToolUseResult = { structuredPatch: [] };

async function drive(script: StreamChunk[], throwAfter = -1): Promise<Recorder> {
	const rec = makeRecorder();
	await new RunChatTurnUseCase(new ScriptedRuntime(script, throwAfter)).run(
		{ request: REQUEST, history: HISTORY },
		rec.sink,
	);
	return rec;
}

describe('RunChatTurnUseCase P2 dispatch (TEST-RR-005/006/007/009/012/027)', () => {
	it('tool_use -> onToolUse(id,name,input)', async () => {
		const rec = await drive([
			{ type: 'tool_use', id: 't1', name: 'Read', input: { file_path: 'x' } },
			{ type: 'done' },
		]);
		expect(rec.calls).toEqual(['start', 'toolUse', 'done']);
		expect(rec.last.toolUse).toEqual(['t1', 'Read', { file_path: 'x' }]);
	});

	it('tool_result -> onToolResult(id,content,isError,toolUseResult)', async () => {
		const rec = await drive([
			{ type: 'tool_result', id: 't1', content: 'ok', isError: false, toolUseResult: PATCH },
			{ type: 'done' },
		]);
		expect(rec.calls).toEqual(['start', 'toolResult', 'done']);
		expect(rec.last.toolResult).toEqual(['t1', 'ok', false, PATCH]);
	});

	it('tool_result with no isError defaults to false', async () => {
		const rec = await drive([
			{ type: 'tool_result', id: 't1', content: 'ok' },
			{ type: 'done' },
		]);
		expect(rec.last.toolResult).toEqual(['t1', 'ok', false, undefined]);
	});

	it('tool_output -> onToolOutput(id,content)', async () => {
		const rec = await drive([
			{ type: 'tool_output', id: 't1', content: 'chunk' },
			{ type: 'done' },
		]);
		expect(rec.last.toolOutput).toEqual(['t1', 'chunk']);
	});

	it('thinking -> onThinking(content)', async () => {
		const rec = await drive([{ type: 'thinking', content: 'hmm' }, { type: 'done' }]);
		expect(rec.last.thinking).toEqual(['hmm']);
	});

	it('subagent_tool_use -> onSubagentToolUse(subagentId,id,name,input)', async () => {
		const rec = await drive([
			{ type: 'subagent_tool_use', subagentId: 's1', id: 't1', name: 'Read', input: { p: 1 } },
			{ type: 'done' },
		]);
		expect(rec.last.subagentToolUse).toEqual(['s1', 't1', 'Read', { p: 1 }]);
	});

	it('subagent_tool_result -> onSubagentToolResult(subagentId,id,content,isError,result)', async () => {
		const rec = await drive([
			{
				type: 'subagent_tool_result',
				subagentId: 's1',
				id: 't1',
				content: 'r',
				isError: true,
				toolUseResult: PATCH,
			},
			{ type: 'done' },
		]);
		expect(rec.last.subagentToolResult).toEqual(['s1', 't1', 'r', true, PATCH]);
	});

	it('async_subagent_result -> onAsyncSubagentResult(agentId,status,result)', async () => {
		const rec = await drive([
			{ type: 'async_subagent_result', agentId: 'a1', status: 'completed', result: 'done' },
			{ type: 'done' },
		]);
		expect(rec.last.asyncSubagentResult).toEqual(['a1', 'completed', 'done']);
	});

	it('context_compacted -> onContextCompacted()', async () => {
		const rec = await drive([{ type: 'context_compacted' }, { type: 'done' }]);
		expect(rec.calls).toEqual(['start', 'contextCompacted', 'done']);
	});

	it('notice -> onNotice(content,level)', async () => {
		const rec = await drive([
			{ type: 'notice', content: 'heads up', level: 'warning' },
			{ type: 'done' },
		]);
		expect(rec.last.notice).toEqual(['heads up', 'warning']);
	});

	it('text still routes to onText (P1 leg preserved)', async () => {
		const rec = await drive([{ type: 'text', content: 'hello' }, { type: 'done' }]);
		expect(rec.calls).toEqual(['start', 'text', 'done']);
		expect(rec.last.text).toEqual(['hello']);
	});

	it('usage still routes to onUsage (P1 leg preserved)', async () => {
		const rec = await drive([{ type: 'usage', usage: USAGE }, { type: 'done' }]);
		expect(rec.last.usage).toEqual([USAGE]);
	});

	it('an unhandled future chunk member is ignored by the default branch; done finalises (EC-RR-14)', async () => {
		const rec = await drive([
			{ type: 'user_message_start', content: 'q' },
			{ type: 'assistant_message_start' },
			{ type: 'done' },
		]);
		// no leg for the unhandled members; only start + done
		expect(rec.calls).toEqual(['start', 'done']);
	});

	it('an error chunk stays the {type:error} boundary (onErrorChunk), then continues to done', async () => {
		const rec = await drive([
			{ type: 'tool_use', id: 't1', name: 'Read', input: {} },
			{ type: 'error', content: 'rate limited' },
			{ type: 'done' },
		]);
		expect(rec.calls).toEqual(['start', 'toolUse', 'error', 'done']);
		expect(rec.last.error).toEqual(['rate limited']);
	});

	it('a runtime generator throw synthesises onErrorChunk + onDone (no rethrow)', async () => {
		const rec = await drive(
			[{ type: 'tool_use', id: 't1', name: 'Read', input: {} }, { type: 'done' }],
			1,
		);
		// tool_use (index 0) is dispatched, then the generator throws before index 1 ->
		// synthetic error + done (the runtime never rethrows across the port, ADR-CC-001 §1).
		expect(rec.calls).toEqual(['start', 'toolUse', 'error', 'done']);
	});

	it('drives a full representative rich turn through every P2 leg in order', async () => {
		const rec = await drive([
			{ type: 'text', content: 'Working' },
			{ type: 'thinking', content: 'plan' },
			{ type: 'tool_use', id: 't1', name: 'Read', input: {} },
			{ type: 'tool_result', id: 't1', content: 'read', toolUseResult: PATCH },
			{ type: 'tool_use', id: 't2', name: 'Write', input: {} },
			{ type: 'tool_output', id: 't2', content: 'partial' },
			{ type: 'tool_result', id: 't2', content: 'wrote', toolUseResult: PATCH },
			{ type: 'subagent_tool_use', subagentId: 's1', id: 'st1', name: 'Grep', input: {} },
			{ type: 'subagent_tool_result', subagentId: 's1', id: 'st1', content: 'found' },
			{ type: 'async_subagent_result', agentId: 'a1', status: 'completed' },
			{ type: 'usage', usage: USAGE },
			{ type: 'done' },
		]);
		expect(rec.calls).toEqual([
			'start',
			'text',
			'thinking',
			'toolUse',
			'toolResult',
			'toolUse',
			'toolOutput',
			'toolResult',
			'subagentToolUse',
			'subagentToolResult',
			'asyncSubagentResult',
			'usage',
			'done',
		]);
	});
});
