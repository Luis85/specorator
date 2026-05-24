/**
 * T-RR-008 (TEST-RR-026, U leg) — RED: `MockChatRuntime` default script emits a
 * scripted RICH turn so `npm run dev` drives every P2 renderer headlessly.
 *
 * SPEC-RR-013: the default script extends to yield, in order, a representative
 * rich turn —
 *   assistant_message_start → text → thinking → tool_use(Read) →
 *   tool_result(Read) → tool_use(Write, structuredPatch +3/−1) →
 *   tool_result(Write) → tool_use(TodoWrite) → tool_result(TodoWrite) →
 *   subagent_tool_use → subagent_tool_result → async_subagent_result(completed) →
 *   usage → done.
 * Each chunk keeps the per-chunk yield boundary (SPEC-CC-011) and the generator
 * still terminates with exactly one `done`. The script stays injectable per test
 * (P1 contract) — passing a custom script overrides the rich default.
 *
 * Fails (RED) until T-RR-010 extends the default script.
 *
 * Traces: TEST-RR-026 (U leg), SPEC-RR-013, REQ-RR-001, NFR-RR-002, NFR-RR-014.
 */
import { describe, it, expect } from 'vitest';
import { MockChatRuntime } from '@/infrastructure/mock/MockChatRuntime';
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

/** Index of the first chunk of the given type, or -1. */
function idx(chunks: StreamChunk[], type: StreamChunk['type']): number {
	return chunks.findIndex((c) => c.type === type);
}

describe('MockChatRuntime default rich script (TEST-RR-026 U leg)', () => {
	it('emits the representative P2 rich-turn chunk types', async () => {
		const runtime = new MockChatRuntime();
		const chunks = await drain(runtime.query(prepare(runtime, 'hi')));
		const types = new Set(chunks.map((c) => c.type));
		for (const t of [
			'text',
			'thinking',
			'tool_use',
			'tool_result',
			'subagent_tool_use',
			'subagent_tool_result',
			'async_subagent_result',
			'usage',
			'done',
		] as const) {
			expect(types.has(t)).toBe(true);
		}
	});

	it('drives Read, Write and TodoWrite tool calls', async () => {
		const runtime = new MockChatRuntime();
		const chunks = await drain(runtime.query(prepare(runtime, 'hi')));
		const toolNames = chunks
			.filter((c): c is Extract<StreamChunk, { type: 'tool_use' }> => c.type === 'tool_use')
			.map((c) => c.name);
		expect(toolNames).toContain('Read');
		expect(toolNames).toContain('Write');
		expect(toolNames).toContain('TodoWrite');
	});

	it('carries a structuredPatch (+3/−1) on the Write tool_result', async () => {
		const runtime = new MockChatRuntime();
		const chunks = await drain(runtime.query(prepare(runtime, 'hi')));
		const writeUse = chunks.find(
			(c): c is Extract<StreamChunk, { type: 'tool_use' }> =>
				c.type === 'tool_use' && c.name === 'Write',
		);
		expect(writeUse).toBeDefined();
		const writeResult = chunks.find(
			(c): c is Extract<StreamChunk, { type: 'tool_result' }> =>
				c.type === 'tool_result' && c.id === writeUse?.id,
		);
		expect(writeResult).toBeDefined();
		const patch = writeResult?.toolUseResult?.structuredPatch;
		expect(Array.isArray(patch)).toBe(true);
		const lines = (patch ?? []).flatMap((h) => h.lines);
		expect(lines.filter((l) => l.startsWith('+'))).toHaveLength(3);
		expect(lines.filter((l) => l.startsWith('-'))).toHaveLength(1);
	});

	it('the TodoWrite tool_use carries a todos array in its input', async () => {
		const runtime = new MockChatRuntime();
		const chunks = await drain(runtime.query(prepare(runtime, 'hi')));
		const todoUse = chunks.find(
			(c): c is Extract<StreamChunk, { type: 'tool_use' }> =>
				c.type === 'tool_use' && c.name === 'TodoWrite',
		);
		expect(todoUse).toBeDefined();
		expect(Array.isArray(todoUse?.input.todos)).toBe(true);
	});

	it('emits an async_subagent_result with status completed', async () => {
		const runtime = new MockChatRuntime();
		const chunks = await drain(runtime.query(prepare(runtime, 'hi')));
		const asyncResult = chunks.find(
			(c): c is Extract<StreamChunk, { type: 'async_subagent_result' }> =>
				c.type === 'async_subagent_result',
		);
		expect(asyncResult?.status).toBe('completed');
	});

	it('orders thinking before the first tool_use, and usage before the terminal done', async () => {
		const runtime = new MockChatRuntime();
		const chunks = await drain(runtime.query(prepare(runtime, 'hi')));
		expect(idx(chunks, 'thinking')).toBeLessThan(idx(chunks, 'tool_use'));
		expect(idx(chunks, 'usage')).toBeLessThan(idx(chunks, 'done'));
		expect(chunks[chunks.length - 1]).toEqual({ type: 'done' });
		expect(chunks.filter((c) => c.type === 'done')).toHaveLength(1);
	});

	it('preserves the per-chunk yield boundary (one rich chunk per resumed tick)', async () => {
		const runtime = new MockChatRuntime();
		const gen = runtime.query(prepare(runtime, 'hi'));
		const first = await gen.next();
		const second = await gen.next();
		expect(first.done).toBe(false);
		expect(second.done).toBe(false);
		// Two distinct chunks observed across two ticks — not the whole turn batched.
		expect(first.value).toBeDefined();
		expect(second.value).toBeDefined();
	});

	it('stays injectable — a custom script overrides the rich default', async () => {
		const runtime = new MockChatRuntime(['just text']);
		const chunks = await drain(runtime.query(prepare(runtime, 'hi')));
		expect(chunks.map((c) => c.type)).toEqual(['text', 'done']);
	});
});
