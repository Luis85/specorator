/**
 * T-RR-022 (RED) — `chatStore` P2 sink-leg actions (block/tool/subagent state).
 *
 * SPEC-RR-020 + EC-RR-1/2/9/10 + order preservation + the no-op-when-not-streaming
 * invariant. Plain DTOs only cross the store boundary (ADR-003). The store mutates
 * the LIVE assistant message's `contentBlocks`/`toolCalls`; the subagent registry
 * lives off reactive state (WeakMap, like the P1 runner dep). EC-RR-1/2/9 degrade
 * by logging `warn` through the bound `LoggerPort` and ignoring — never throwing,
 * never buffering.
 *
 * Traces: TEST-RR-005, TEST-RR-006, TEST-RR-007, TEST-RR-009.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useChatStore } from '@/ui/stores/chatStore';
import type {
	ChatTurnSink,
	RunChatTurnInput,
	ChatTurnError,
} from '@/application/chat/RunChatTurnUseCase';
import { ok, type Result } from '@/domain/shared/Result';
import type { LoggerPort } from '@/domain/ports';
import type { ContentBlock } from '@/domain/chat/ContentBlock';
import type { ToolCall } from '@/domain/chat/ToolCall';
import type { ToolUseResult } from '@/domain/chat/diff/ToolUseResult';

/** A scriptable runner standing in for `RunChatTurnUseCase` (mirrors the P1 fake). */
class FakeRunner {
	sink: ChatTurnSink | null = null;
	lastInput: RunChatTurnInput | null = null;
	result: Result<void, ChatTurnError> = ok(undefined);
	duringRun: ((sink: ChatTurnSink) => void) | null = null;
	runCalls = 0;
	cancel = vi.fn();

	run(input: RunChatTurnInput, sink: ChatTurnSink): Promise<Result<void, ChatTurnError>> {
		this.runCalls += 1;
		this.lastInput = input;
		this.sink = sink;
		this.duringRun?.(sink);
		return Promise.resolve(this.result);
	}
}

function fakeLogger(): LoggerPort {
	return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function freshStore() {
	setActivePinia(createPinia());
	const store = useChatStore();
	const runner = new FakeRunner();
	const notice = vi.fn();
	const logger = fakeLogger();
	store.bindTurnRunner(runner, notice, logger);
	return { store, runner, notice, logger };
}

/** Drive the store into a streaming turn with one live assistant message. */
async function startStreaming(store: ReturnType<typeof useChatStore>) {
	await store.sendMessage('go');
	store.onAssistantStart();
}

function liveBlocks(store: ReturnType<typeof useChatStore>): ContentBlock[] {
	const live = store.messages.find((m) => m.id === store.liveAssistantId);
	return live?.contentBlocks ?? [];
}

function liveTools(store: ReturnType<typeof useChatStore>): ToolCall[] {
	const live = store.messages.find((m) => m.id === store.liveAssistantId);
	return live?.toolCalls ?? [];
}

describe('chatStore P2 sink legs (SPEC-RR-020)', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	describe('onToolUse (TEST-RR-005, REQ-RR-002)', () => {
		it('creates a running ToolCall + appends a tool_use block', async () => {
			const { store } = freshStore();
			await startStreaming(store);

			store.onToolUse('t1', 'Read', { file_path: 'a.ts' });

			expect(liveTools(store)).toEqual([
				{ id: 't1', name: 'Read', input: { file_path: 'a.ts' }, status: 'running' },
			]);
			expect(liveBlocks(store)).toEqual([{ type: 'tool_use', toolId: 't1' }]);
		});

		it('merges input on a repeat tool_use for the same id — no duplicate block', async () => {
			const { store } = freshStore();
			await startStreaming(store);

			store.onToolUse('t1', 'Read', { file_path: 'a.ts' });
			store.onToolUse('t1', 'Read', { offset: 10 });

			expect(liveTools(store)).toHaveLength(1);
			expect(liveTools(store)[0].input).toEqual({ file_path: 'a.ts', offset: 10 });
			expect(liveBlocks(store).filter((b) => b.type === 'tool_use')).toHaveLength(1);
		});

		it('is a no-op when not streaming', () => {
			const { store } = freshStore();
			store.onToolUse('t1', 'Read', {});
			expect(store.messages).toEqual([]);
		});
	});

	describe('onToolResult (TEST-RR-006, REQ-RR-003/026)', () => {
		it('matches by id, sets result + completed status', async () => {
			const { store } = freshStore();
			await startStreaming(store);
			store.onToolUse('t1', 'Read', { file_path: 'a.ts' });

			store.onToolResult('t1', 'file contents', false);

			expect(liveTools(store)[0].result).toBe('file contents');
			expect(liveTools(store)[0].status).toBe('completed');
		});

		it('sets error status when isError', async () => {
			const { store } = freshStore();
			await startStreaming(store);
			store.onToolUse('t1', 'Read', {});

			store.onToolResult('t1', 'boom', true);

			expect(liveTools(store)[0].status).toBe('error');
		});

		it('computes diffData for a Write tool with a structuredPatch (REQ-RR-026)', async () => {
			const { store } = freshStore();
			await startStreaming(store);
			store.onToolUse('w1', 'Write', { file_path: 'new.ts' });

			const tur: ToolUseResult = {
				filePath: 'new.ts',
				structuredPatch: [{ oldStart: 1, oldLines: 0, newStart: 1, newLines: 2, lines: ['+a', '+b'] }],
			};
			store.onToolResult('w1', 'ok', false, tur);

			const diff = liveTools(store)[0].diffData;
			expect(diff).toBeDefined();
			expect(diff?.stats).toEqual({ added: 2, removed: 0 });
			expect(diff?.diffLines).toHaveLength(2);
			expect(diff?.filePath).toBe('new.ts');
		});

		it('EC-RR-3: leaves diffData unset for a Write with no usable diff', async () => {
			const { store } = freshStore();
			await startStreaming(store);
			store.onToolUse('w1', 'Write', {});

			store.onToolResult('w1', 'DONE', false);

			expect(liveTools(store)[0].diffData).toBeUndefined();
		});

		it('EC-RR-1: unknown id → warn + ignore (no crash, no orphan)', async () => {
			const { store, logger } = freshStore();
			await startStreaming(store);

			store.onToolResult('ghost', 'x', false);

			expect(logger.warn).toHaveBeenCalled();
			expect(liveTools(store)).toEqual([]);
		});

		it('EC-RR-2: tool_result before any tool_use → warn + ignore (no buffer)', async () => {
			const { store, logger } = freshStore();
			await startStreaming(store);

			store.onToolResult('t1', 'early', false);
			// A later tool_use must NOT pick up the early result (no late-bind).
			store.onToolUse('t1', 'Read', {});

			expect(logger.warn).toHaveBeenCalled();
			expect(liveTools(store)[0].result).toBeUndefined();
		});
	});

	describe('onToolOutput (TEST-RR-006, REQ-RR-003)', () => {
		it('appends interim output to the matched tool result', async () => {
			const { store } = freshStore();
			await startStreaming(store);
			store.onToolUse('t1', 'Bash', { command: 'ls' });

			store.onToolOutput('t1', 'line1\n');
			store.onToolOutput('t1', 'line2\n');

			expect(liveTools(store)[0].result).toBe('line1\nline2\n');
		});

		it('EC-RR-1: unknown id → ignore', async () => {
			const { store } = freshStore();
			await startStreaming(store);
			store.onToolOutput('ghost', 'x');
			expect(liveTools(store)).toEqual([]);
		});
	});

	describe('onThinking (TEST-RR-007, REQ-RR-004/011)', () => {
		it('pushes a thinking block, then accumulates onto it', async () => {
			const { store } = freshStore();
			await startStreaming(store);

			store.onThinking('Step ');
			store.onThinking('one');

			expect(liveBlocks(store)).toEqual([{ type: 'thinking', content: 'Step one' }]);
		});

		it('starts a new thinking block when a non-thinking block intervenes (order preserved)', async () => {
			const { store } = freshStore();
			await startStreaming(store);

			store.onThinking('first');
			store.onToolUse('t1', 'Read', {});
			store.onThinking('second');

			const blocks = liveBlocks(store);
			expect(blocks.map((b) => b.type)).toEqual(['thinking', 'tool_use', 'thinking']);
		});
	});

	describe('onText ordered block (REQ-RR-011)', () => {
		it('extends a trailing text block and preserves order across tool/thinking', async () => {
			const { store } = freshStore();
			await startStreaming(store);

			store.onText('Hello ');
			store.onText('world');
			store.onThinking('hmm');
			store.onText('after');

			const blocks = liveBlocks(store);
			expect(blocks.map((b) => b.type)).toEqual(['text', 'thinking', 'text']);
			expect(blocks[0]).toEqual({ type: 'text', content: 'Hello world' });
			expect(blocks[2]).toEqual({ type: 'text', content: 'after' });
		});
	});

	describe('subagent legs (TEST-RR-009, REQ-RR-006/021a)', () => {
		it('a Task/Agent tool_use establishes a SubagentInfo on the spawning ToolCall', async () => {
			const { store } = freshStore();
			await startStreaming(store);

			store.onToolUse('task1', 'Task', { description: 'worker', prompt: 'do it' });

			const spawn = liveTools(store).find((t) => t.id === 'task1');
			expect(spawn?.subagent).toBeDefined();
			expect(spawn?.subagent?.id).toBe('task1');
			expect(spawn?.subagent?.toolCalls).toEqual([]);
		});

		it('onSubagentToolUse pushes a nested running ToolCall under the spawning subagent', async () => {
			const { store } = freshStore();
			await startStreaming(store);
			store.onToolUse('task1', 'Task', { subagent_type: 'general' });

			store.onSubagentToolUse('task1', 'n1', 'Read', { file_path: 'x.ts' });

			const spawn = liveTools(store).find((t) => t.id === 'task1');
			expect(spawn?.subagent?.toolCalls).toEqual([
				{ id: 'n1', name: 'Read', input: { file_path: 'x.ts' }, status: 'running' },
			]);
			// No top-level block for a nested tool (only the spawning Task tool_use).
			expect(liveBlocks(store).filter((b) => b.type === 'tool_use')).toHaveLength(1);
		});

		it('onSubagentToolResult sets the nested tool result + status', async () => {
			const { store } = freshStore();
			await startStreaming(store);
			store.onToolUse('task1', 'Task', {});
			store.onSubagentToolUse('task1', 'n1', 'Read', {});

			store.onSubagentToolResult('task1', 'n1', 'nested result', false);

			const spawn = liveTools(store).find((t) => t.id === 'task1');
			expect(spawn?.subagent?.toolCalls[0].result).toBe('nested result');
			expect(spawn?.subagent?.toolCalls[0].status).toBe('completed');
		});

		it('EC-RR-9: unknown subagentId → warn + ignore', async () => {
			const { store, logger } = freshStore();
			await startStreaming(store);

			store.onSubagentToolUse('ghost', 'n1', 'Read', {});

			expect(logger.warn).toHaveBeenCalled();
		});

		it('onAsyncSubagentResult consolidates the subagent (EC-RR-10 error keeps empty result)', async () => {
			const { store } = freshStore();
			await startStreaming(store);
			store.onToolUse('task1', 'Task', {});

			store.onAsyncSubagentResult('task1', 'error');

			const spawn = liveTools(store).find((t) => t.id === 'task1');
			expect(spawn?.subagent?.asyncStatus).toBe('error');
			expect(spawn?.subagent?.status).toBe('error');
			expect(spawn?.subagent?.result).toBeUndefined();
		});
	});

	describe('onContextCompacted + onNotice (render-only)', () => {
		it('onContextCompacted pushes a render-only block', async () => {
			const { store } = freshStore();
			await startStreaming(store);
			store.onContextCompacted();
			expect(liveBlocks(store)).toEqual([{ type: 'context_compacted' }]);
		});

		it('onNotice does not crash and is a no-op when not streaming', () => {
			const { store } = freshStore();
			expect(() => {
				store.onNotice('heads up', 'info');
			}).not.toThrow();
			expect(store.messages).toEqual([]);
		});
	});

	describe('invariants', () => {
		it('every P2 leg is a no-op after the turn finalises (status !== streaming)', async () => {
			const { store } = freshStore();
			await startStreaming(store);
			const liveId = store.liveAssistantId;
			store.onDone();

			store.onToolUse('t1', 'Read', {});
			store.onThinking('late');
			store.onContextCompacted();

			const message = store.messages.find((m) => m.id === liveId);
			expect(message?.contentBlocks ?? []).toEqual([]);
			expect(message?.toolCalls ?? []).toEqual([]);
		});

		it('$reset clears the P2 subagent registry (no leak across turns)', async () => {
			const { store, logger } = freshStore();
			await startStreaming(store);
			store.onToolUse('task1', 'Task', {});
			store.$reset();

			// After reset, a nested tool for the old subagent id must warn + ignore
			// (the registry was cleared — no stale SubagentInfo carries across turns).
			await startStreaming(store);
			store.onSubagentToolUse('task1', 'n1', 'Read', {});

			expect(logger.warn).toHaveBeenCalled();
		});
	});
});
