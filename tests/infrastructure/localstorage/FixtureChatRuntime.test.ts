/**
 * T-CC-008 (TEST-CC-016, U leg) — RED: `FixtureChatRuntime` replays a bundled
 * transcript; no subprocess.
 *
 * SPEC-CC-012: the GitHub Pages demo runtime replays a short canned
 * `text…usage…done` `StreamChunk[]` transcript as an async generator with the
 * same per-chunk yield discipline as `MockChatRuntime`; `ensureReady → true`; no
 * subprocess. Fails (RED) until T-CC-009 implements the runtime.
 *
 * Traces: TEST-CC-016 (U leg), SPEC-CC-012, REQ-CC-014.
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

describe('FixtureChatRuntime (TEST-CC-016 U leg)', () => {
	it('implements the ChatRuntimePort surface with providerId "claude"', () => {
		const runtime: ChatRuntimePort = new FixtureChatRuntime();
		expect(runtime.providerId).toBe('claude');
		expect(runtime.isReady()).toBe(true);
	});

	it('ensureReady resolves true (no subprocess)', async () => {
		const runtime = new FixtureChatRuntime();
		await expect(runtime.ensureReady()).resolves.toBe(true);
	});

	it('replays a canned text…usage…done transcript', async () => {
		const runtime = new FixtureChatRuntime();
		const chunks = await drain(runtime.query(prepare(runtime, 'hi')));
		// At least one text chunk, exactly one usage chunk, terminated by exactly one done.
		expect(chunks.some((c) => c.type === 'text')).toBe(true);
		expect(chunks.filter((c) => c.type === 'usage')).toHaveLength(1);
		expect(chunks.filter((c) => c.type === 'done')).toHaveLength(1);
		expect(chunks[chunks.length - 1]).toEqual({ type: 'done' });
	});

	it('orders usage before the terminal done', async () => {
		const runtime = new FixtureChatRuntime();
		const chunks = await drain(runtime.query(prepare(runtime, 'hi')));
		const usageIdx = chunks.findIndex((c) => c.type === 'usage');
		const doneIdx = chunks.findIndex((c) => c.type === 'done');
		expect(usageIdx).toBeGreaterThanOrEqual(0);
		expect(usageIdx).toBeLessThan(doneIdx);
	});

	it('concatenated text spans form a non-empty reply', async () => {
		const runtime = new FixtureChatRuntime();
		const chunks = await drain(runtime.query(prepare(runtime, 'hi')));
		const text = chunks
			.filter((c): c is { type: 'text'; content: string } => c.type === 'text')
			.map((c) => c.content)
			.join('');
		expect(text.length).toBeGreaterThan(0);
	});

	it('exposes a per-chunk yield boundary (one chunk per resumed tick)', async () => {
		const runtime = new FixtureChatRuntime();
		const gen = runtime.query(prepare(runtime, 'hi'));
		const first = await gen.next();
		expect(first.done).toBe(false);
		// The very first yielded chunk is observable on its own tick (not the whole
		// transcript batched on completion) — proves incremental streaming feel.
		expect(first.value).toBeDefined();
	});

	it('cancel() stops further yields', async () => {
		const runtime = new FixtureChatRuntime();
		const gen = runtime.query(prepare(runtime, 'hi'));
		const collected: StreamChunk[] = [];
		const first = await gen.next();
		if (!first.done) collected.push(first.value);
		runtime.cancel();
		for await (const chunk of gen) collected.push(chunk);
		// No terminal done after cancel — the generator returns early.
		expect(collected.filter((c) => c.type === 'done')).toHaveLength(0);
	});

	it('getSessionId / resetSession behave synthetically', () => {
		const runtime = new FixtureChatRuntime();
		expect(typeof runtime.getSessionId()).toBe('string');
		runtime.resetSession();
		expect(runtime.getSessionId()).toBeNull();
	});

	it('onReadyStateChange returns an unsubscriber', () => {
		const runtime = new FixtureChatRuntime();
		const unsub = runtime.onReadyStateChange(() => {});
		expect(typeof unsub).toBe('function');
		expect(() => {
			unsub();
		}).not.toThrow();
	});
});
