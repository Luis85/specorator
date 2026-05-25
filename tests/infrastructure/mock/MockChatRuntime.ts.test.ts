/**
 * T-TS-012 (TEST-TS-016 runtime U leg / TEST-TS-020 cold-start backing) — RED:
 * the grown `MockChatRuntime` (+ the LocalStorage `FixtureChatRuntime`) report
 * getCapabilities() -> {supportsFork:true,supportsRewind:true}; resumeSession/
 * setResumeCheckpoint are RECORDED NO-OPS capturing the last call
 * (getResumedSessionId()/getResumeCheckpoint()); a query(turn,[],{forceColdStart:true})
 * accumulates scripted text + terminates with done for the title side-query, and
 * forceColdStart causes the runtime to ignore any bound session for that query.
 *
 * (The three additive members + forceColdStart recording were added in T-TS-005
 * for compile; this file is the behavioural RED→green contract.)
 *
 * Traces: TEST-TS-016 (runtime U leg), TEST-TS-020 (cold-start backing),
 * SPEC-TS-009, REQ-TS-013/019/021/024/027.
 */
import { describe, it, expect } from 'vitest';
import { MockChatRuntime } from '@/infrastructure/mock/MockChatRuntime';
import { FixtureChatRuntime } from '@/infrastructure/localstorage/FixtureChatRuntime';
import type { StreamChunk, PreparedChatTurn, ChatTurnRequest } from '@/domain/ports';

function prepare(runtime: MockChatRuntime | FixtureChatRuntime, text: string): PreparedChatTurn {
	const request: ChatTurnRequest = { text };
	return runtime.prepareTurn(request);
}

async function drain(gen: AsyncGenerator<StreamChunk>): Promise<StreamChunk[]> {
	const out: StreamChunk[] = [];
	for await (const chunk of gen) out.push(chunk);
	return out;
}

describe('MockChatRuntime grown members (TEST-TS-016 runtime U leg)', () => {
	it('getCapabilities() -> fork/rewind true + P4 plan/inline true (default capable)', () => {
		// P4 (SPEC-CP-009): the Mock defaults capable so the answerable inline blocks
		// exercise by default; a test flips them via setSupports* for the gated branch.
		expect(new MockChatRuntime().getCapabilities()).toEqual({
			supportsFork: true,
			supportsRewind: true,
			supportsPlanMode: true,
			supportsInlineResponse: true,
		});
	});

	it('resumeSession is a recorded no-op capturing the last call', () => {
		const runtime = new MockChatRuntime();
		expect(runtime.getResumedSessionId()).toBeNull();
		runtime.resumeSession('sess-42');
		expect(runtime.getResumedSessionId()).toBe('sess-42');
	});

	it('setResumeCheckpoint is a recorded no-op capturing the last call', () => {
		const runtime = new MockChatRuntime();
		expect(runtime.getResumeCheckpoint()).toBeNull();
		runtime.setResumeCheckpoint('assistant-7');
		expect(runtime.getResumeCheckpoint()).toBe('assistant-7');
	});
});

describe('MockChatRuntime cold-start side-query (TEST-TS-020 backing)', () => {
	it('a scripted title side-query accumulates text and terminates with done', async () => {
		const runtime = new MockChatRuntime([
			{ type: 'text', content: 'Refactor the ' },
			{ type: 'text', content: 'history store' },
		]);
		const chunks = await drain(
			runtime.query(prepare(runtime, 'first user message'), [], { forceColdStart: true }),
		);
		const text = chunks
			.filter((c): c is Extract<StreamChunk, { type: 'text' }> => c.type === 'text')
			.map((c) => c.content)
			.join('');
		expect(text).toBe('Refactor the history store');
		expect(chunks[chunks.length - 1]?.type).toBe('done');
	});

	it('forceColdStart is recorded for that single query (ignores the bound session)', async () => {
		const runtime = new MockChatRuntime([{ type: 'text', content: 'x' }]);
		runtime.resumeSession('bound-session');
		await drain(runtime.query(prepare(runtime, 'm'), [], { forceColdStart: true }));
		expect(runtime.getLastForceColdStart()).toBe(true);

		await drain(runtime.query(prepare(runtime, 'm2'), []));
		expect(runtime.getLastForceColdStart()).toBe(false);
	});
});

describe('FixtureChatRuntime grown members (parity)', () => {
	it('reports the same capabilities + recorded session ops', () => {
		const runtime = new FixtureChatRuntime();
		// P4 (SPEC-CP-010): the demo gates BOTH inline flags false (read-only inline).
		expect(runtime.getCapabilities()).toEqual({
			supportsFork: true,
			supportsRewind: true,
			supportsPlanMode: false,
			supportsInlineResponse: false,
		});
		runtime.resumeSession('sess-demo');
		runtime.setResumeCheckpoint('demo-a1');
		expect(runtime.getResumedSessionId()).toBe('sess-demo');
		expect(runtime.getResumeCheckpoint()).toBe('demo-a1');
	});
});
