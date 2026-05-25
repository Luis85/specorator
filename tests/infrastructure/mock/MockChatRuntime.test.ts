/**
 * T-CC-006 (TEST-CC-001) — RED: `MockChatRuntime` scripted streaming + cancel.
 *
 * SPEC-CC-011: a scripted in-memory `ChatRuntimePort`. Asserts the scripted
 * `["Hel","lo"]` + `done` yields in order, concatenation = `"Hello"`, the
 * generator completes after `done`, the per-chunk yield boundary is observable
 * per tick, `cancel()` stops further yields, and scripted `error` / `usage`
 * chunks are emitted on request. Fails (RED) until T-CC-007 implements the runtime.
 *
 * Traces: TEST-CC-001, SPEC-CC-011, REQ-CC-001, REQ-CC-001a, REQ-CC-014.
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

describe('MockChatRuntime (TEST-CC-001)', () => {
	it('implements the ChatRuntimePort surface with providerId "claude"', () => {
		const runtime: ChatRuntimePort = new MockChatRuntime();
		expect(runtime.providerId).toBe('claude');
		expect(runtime.isReady()).toBe(true);
	});

	it('ensureReady resolves true', async () => {
		const runtime = new MockChatRuntime();
		await expect(runtime.ensureReady()).resolves.toBe(true);
	});

	it('streams scripted ["Hel","lo"] then done, in order; concat = "Hello"', async () => {
		const runtime = new MockChatRuntime(['Hel', 'lo']);
		const chunks = await drain(runtime.query(prepare(runtime, 'hi')));
		expect(chunks.map((c) => c.type)).toEqual(['text', 'text', 'done']);
		const text = chunks
			.filter((c): c is { type: 'text'; content: string } => c.type === 'text')
			.map((c) => c.content)
			.join('');
		expect(text).toBe('Hello');
	});

	it('completes after done (generator is exhausted)', async () => {
		const runtime = new MockChatRuntime(['x']);
		const gen = runtime.query(prepare(runtime, 'hi'));
		await drain(gen);
		const after = await gen.next();
		expect(after.done).toBe(true);
	});

	it('exposes a per-chunk yield boundary (one chunk per resumed tick)', async () => {
		const runtime = new MockChatRuntime(['a', 'b']);
		const gen = runtime.query(prepare(runtime, 'hi'));
		const first = await gen.next();
		expect(first.done).toBe(false);
		expect(first.value).toEqual({ type: 'text', content: 'a' });
		const second = await gen.next();
		expect(second.value).toEqual({ type: 'text', content: 'b' });
		const third = await gen.next();
		// R-TS-001: the terminator carries an additive per-turn assistantMessageId.
		expect(third.value).toMatchObject({ type: 'done' });
	});

	it('cancel() stops further yields', async () => {
		const runtime = new MockChatRuntime(['a', 'b', 'c']);
		const gen = runtime.query(prepare(runtime, 'hi'));
		const collected: StreamChunk[] = [];
		const first = await gen.next();
		if (!first.done) collected.push(first.value);
		runtime.cancel();
		for await (const chunk of gen) collected.push(chunk);
		// Only the first chunk (yielded before cancel) is observed; no further text.
		const texts = collected.filter((c) => c.type === 'text');
		expect(texts).toHaveLength(1);
		expect(texts[0]).toEqual({ type: 'text', content: 'a' });
	});

	it('emits a scripted error chunk on request', async () => {
		const runtime = new MockChatRuntime([{ type: 'error', content: 'boom' }]);
		const chunks = await drain(runtime.query(prepare(runtime, 'hi')));
		expect(chunks).toContainEqual({ type: 'error', content: 'boom' });
		expect(chunks[chunks.length - 1]).toMatchObject({ type: 'done' });
	});

	it('emits a scripted usage chunk on request', async () => {
		const usage = { inputTokens: 3, contextWindow: 200000, contextTokens: 3, percentage: 0 };
		const runtime = new MockChatRuntime([{ type: 'usage', usage }]);
		const chunks = await drain(runtime.query(prepare(runtime, 'hi')));
		expect(chunks).toContainEqual({ type: 'usage', usage });
	});

	it('default script yields a text…done reply (npm run dev ergonomics)', async () => {
		const runtime = new MockChatRuntime();
		const chunks = await drain(runtime.query(prepare(runtime, 'hi')));
		expect(chunks.some((c) => c.type === 'text')).toBe(true);
		expect(chunks[chunks.length - 1]).toMatchObject({ type: 'done' });
	});

	it('getSessionId / resetSession behave synthetically', () => {
		const runtime = new MockChatRuntime();
		expect(typeof runtime.getSessionId()).toBe('string');
		runtime.resetSession();
		expect(runtime.getSessionId()).toBeNull();
	});

	it('onReadyStateChange returns an unsubscriber', () => {
		const runtime = new MockChatRuntime();
		const unsub = runtime.onReadyStateChange(() => {});
		expect(typeof unsub).toBe('function');
		expect(() => {
			unsub();
		}).not.toThrow();
	});
});
