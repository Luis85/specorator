import { describe, it, expect, vi } from 'vitest';
import { CompactConversationUseCase } from '@/application/threads/CompactConversationUseCase';
import { RunChatTurnUseCase, type ChatTurnSink } from '@/application/chat/RunChatTurnUseCase';
import { MockChatRuntime } from '@/infrastructure/mock/MockChatRuntime';
import type { MockChatScriptEntry } from '@/infrastructure/mock/MockChatRuntime';

/**
 * TEST-TS-018 (use-case U leg) — `CompactConversationUseCase` (SPEC-TS-015,
 * REQ-TS-023). Reuses the P2 machinery: a `{type:'context_compacted'}` chunk
 * routes through the EXISTING `RunChatTurnUseCase.dispatchChunk` ->
 * `sink.onContextCompacted()` (no new render machinery). The compaction turn
 * continues from the compacted state; `done` finalises.
 */
function makeSink(): ChatTurnSink & { compacted: number } {
	const sink = {
		compacted: 0,
		onAssistantStart() {},
		onText() {},
		onUsage() {},
		onErrorChunk() {},
		onDone() {},
		onToolUse() {},
		onToolResult() {},
		onToolOutput() {},
		onThinking() {},
		onSubagentToolUse() {},
		onSubagentToolResult() {},
		onAsyncSubagentResult() {},
		onContextCompacted() {
			this.compacted += 1;
		},
		onNotice() {},
	};
	return sink;
}

describe('TEST-TS-018 CompactConversationUseCase', () => {
	it('routes a context_compacted chunk to the existing onContextCompacted sink leg', async () => {
		const script: MockChatScriptEntry[] = [
			{ type: 'text', content: 'Compacting…' },
			{ type: 'context_compacted' },
		];
		const runChatTurn = new RunChatTurnUseCase(new MockChatRuntime(script));
		const sink = makeSink();

		const result = await new CompactConversationUseCase(runChatTurn).execute([], sink);

		expect(result.ok).toBe(true);
		expect(sink.compacted).toBe(1);
	});

	it('reuses RunChatTurnUseCase.run (no new dispatch machinery)', async () => {
		const runChatTurn = new RunChatTurnUseCase(new MockChatRuntime([{ type: 'context_compacted' }]));
		const runSpy = vi.spyOn(runChatTurn, 'run');
		const sink = makeSink();

		await new CompactConversationUseCase(runChatTurn).execute([], sink);

		expect(runSpy).toHaveBeenCalledTimes(1);
	});
});
