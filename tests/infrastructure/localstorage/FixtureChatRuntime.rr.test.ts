/**
 * T-RR-008 (TEST-RR-026, U leg) — RED: `FixtureChatRuntime` bundled transcript
 * emits a RICH reply so the GitHub Pages demo drives the P2 renderers headlessly.
 *
 * SPEC-RR-013: the bundled transcript extends to a believable rich reply — at
 * minimum one tool call, one Write/Edit diff (a `structuredPatch`), and one
 * task-list tool — replayed with the same per-chunk yield discipline as the P1
 * transcript and terminated by exactly one `done`. No subprocess.
 *
 * Fails (RED) until T-RR-010 extends the fixture transcript.
 *
 * Traces: TEST-RR-026 (U leg), SPEC-RR-013, REQ-RR-001, NFR-RR-002, NFR-RR-014.
 */
import { describe, it, expect } from 'vitest';
import { FixtureChatRuntime } from '@/infrastructure/localstorage/FixtureChatRuntime';
import type { ChatRuntimePort } from '@/domain/ports';
import type { StreamChunk } from '@/domain/chat/StreamChunk';

function prepare(runtime: ChatRuntimePort, text: string) {
	return runtime.prepareTurn({ text });
}

async function drain(gen: AsyncGenerator<StreamChunk>): Promise<StreamChunk[]> {
	const out: StreamChunk[] = [];
	for await (const chunk of gen) out.push(chunk);
	return out;
}

describe('FixtureChatRuntime rich transcript (TEST-RR-026 U leg)', () => {
	it('replays at least one tool call (tool_use + tool_result)', async () => {
		const runtime = new FixtureChatRuntime();
		const chunks = await drain(runtime.query(prepare(runtime, 'hi')));
		expect(chunks.some((c) => c.type === 'tool_use')).toBe(true);
		expect(chunks.some((c) => c.type === 'tool_result')).toBe(true);
	});

	it('replays a Write/Edit diff via a structuredPatch on a tool_result', async () => {
		const runtime = new FixtureChatRuntime();
		const chunks = await drain(runtime.query(prepare(runtime, 'hi')));
		const withPatch = chunks.filter(
			(c): c is Extract<StreamChunk, { type: 'tool_result' }> =>
				c.type === 'tool_result' &&
				Array.isArray(c.toolUseResult?.structuredPatch) &&
				c.toolUseResult.structuredPatch.length > 0,
		);
		expect(withPatch.length).toBeGreaterThan(0);
	});

	it('replays a TodoWrite tool call carrying a todos list', async () => {
		const runtime = new FixtureChatRuntime();
		const chunks = await drain(runtime.query(prepare(runtime, 'hi')));
		const todoUse = chunks.find(
			(c): c is Extract<StreamChunk, { type: 'tool_use' }> =>
				c.type === 'tool_use' && c.name === 'TodoWrite',
		);
		expect(todoUse).toBeDefined();
		expect(Array.isArray(todoUse?.input.todos)).toBe(true);
	});

	it('still terminates with exactly one done and keeps usage before it', async () => {
		const runtime = new FixtureChatRuntime();
		const chunks = await drain(runtime.query(prepare(runtime, 'hi')));
		expect(chunks.filter((c) => c.type === 'done')).toHaveLength(1);
		expect(chunks[chunks.length - 1]).toEqual({ type: 'done' });
		const usageIdx = chunks.findIndex((c) => c.type === 'usage');
		const doneIdx = chunks.findIndex((c) => c.type === 'done');
		expect(usageIdx).toBeGreaterThanOrEqual(0);
		expect(usageIdx).toBeLessThan(doneIdx);
	});

	it('preserves the per-chunk yield boundary (one chunk per resumed tick)', async () => {
		const runtime = new FixtureChatRuntime();
		const gen = runtime.query(prepare(runtime, 'hi'));
		const first = await gen.next();
		const second = await gen.next();
		expect(first.done).toBe(false);
		expect(second.done).toBe(false);
		expect(first.value).toBeDefined();
		expect(second.value).toBeDefined();
	});
});
