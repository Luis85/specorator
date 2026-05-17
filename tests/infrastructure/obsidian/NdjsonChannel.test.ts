/**
 * WP-11 — Mirror tests for `NdjsonChannel`.
 *
 * Covers:
 *   - Push-channel semantics (push before iterate, iterate before push, complete);
 *   - Line reassembly when stdout splits arbitrarily (Testing F7 — including
 *     8-fragment 64 KiB reassembly and fragment-on-newline);
 *   - 4 MiB stdout-buffer cap (perf-F-8): overflow fires the callback once,
 *     resets the buffer, increments `overflowCount`, and stops further
 *     dispatch.
 *
 * Coverage target per brief: ≥ 90% statements, ≥ 80% branches.
 */
import { describe, expect, it, vi } from 'vitest';

import {
	createNdjsonChannel,
	DEFAULT_STDOUT_MAX_BYTES,
} from '@/infrastructure/obsidian/NdjsonChannel';

async function drain<T>(iter: AsyncIterable<T>, max = 1_000): Promise<T[]> {
	const out: T[] = [];
	for await (const v of iter) {
		out.push(v);
		if (out.length >= max) break;
	}
	return out;
}

describe('NdjsonChannel — push / iterate / complete', () => {
	it('values pushed before iteration are delivered in order', async () => {
		const channel = createNdjsonChannel<string>({ onLine: () => undefined });
		channel.push('a');
		channel.push('b');
		channel.push('c');
		channel.complete();

		const values = await drain(channel.iterate());
		expect(values).toEqual(['a', 'b', 'c']);
	});

	it('values pushed during iteration resume the parked consumer', async () => {
		const channel = createNdjsonChannel<number>({ onLine: () => undefined });
		const iter = channel.iterate()[Symbol.asyncIterator]();

		const pending = iter.next();
		channel.push(42);
		const first = await pending;
		expect(first).toEqual({ value: 42, done: false });

		channel.complete();
		const last = await iter.next();
		expect(last.done).toBe(true);
	});

	it('complete is idempotent; push after complete is dropped', async () => {
		const channel = createNdjsonChannel<string>({ onLine: () => undefined });
		channel.push('a');
		channel.complete();
		channel.complete(); // no-op
		channel.push('b'); // dropped

		const values = await drain(channel.iterate());
		expect(values).toEqual(['a']);
	});
});

describe('NdjsonChannel — line reassembly (REQ-ASM-029, Testing F7)', () => {
	it('flushes a single complete line', () => {
		const seen: string[] = [];
		const channel = createNdjsonChannel<unknown>({ onLine: (l) => seen.push(l) });
		channel.pushBytes('{"type":"x"}\n');
		expect(seen).toEqual(['{"type":"x"}']);
	});

	it('reassembles a stdout buffer split mid-line into two chunks', () => {
		const seen: string[] = [];
		const channel = createNdjsonChannel<unknown>({ onLine: (l) => seen.push(l) });
		channel.pushBytes('{"type":"x", "v":');
		channel.pushBytes('1}\n');
		expect(seen).toEqual(['{"type":"x", "v":1}']);
	});

	it('reassembles a 64 KiB line streamed in 8 KiB fragments (Testing F7)', () => {
		const seen: string[] = [];
		const channel = createNdjsonChannel<unknown>({ onLine: (l) => seen.push(l) });
		const big = 'x'.repeat(64 * 1024);
		// Eight 8 KiB fragments — no fragment contains a newline.
		for (let i = 0; i < 8; i += 1) {
			const start = i * 8 * 1024;
			channel.pushBytes(big.slice(start, start + 8 * 1024));
		}
		expect(seen).toHaveLength(0);
		// Terminator chunk.
		channel.pushBytes('\n');
		expect(seen).toHaveLength(1);
		expect(seen[0]).toBe(big);
		expect(seen[0].length).toBe(64 * 1024);
	});

	it('flushes immediately when a fragment ends exactly on a newline (Testing F7)', () => {
		const seen: string[] = [];
		const channel = createNdjsonChannel<unknown>({ onLine: (l) => seen.push(l) });
		channel.pushBytes('{"a":1}\n'); // fragment ends exactly on \n
		expect(seen).toEqual(['{"a":1}']);
		channel.pushBytes('{"b":2}');
		expect(seen).toEqual(['{"a":1}']);
		channel.pushBytes('\n');
		expect(seen).toEqual(['{"a":1}', '{"b":2}']);
	});

	it('dispatches multiple lines from a single chunk in order', () => {
		const seen: string[] = [];
		const channel = createNdjsonChannel<unknown>({ onLine: (l) => seen.push(l) });
		channel.pushBytes('a\nb\nc\n');
		expect(seen).toEqual(['a', 'b', 'c']);
	});

	it('accepts Buffer chunks as well as strings', () => {
		const seen: string[] = [];
		const channel = createNdjsonChannel<unknown>({ onLine: (l) => seen.push(l) });
		channel.pushBytes(Buffer.from('hello\n', 'utf8'));
		expect(seen).toEqual(['hello']);
	});
});

describe('NdjsonChannel — stdout-buffer cap (perf-F-8)', () => {
	it('fires onOverflow once when the unflushed tail exceeds maxBufferBytes', () => {
		const overflow = vi.fn();
		const channel = createNdjsonChannel<unknown>({
			onLine: () => undefined,
			onOverflow: overflow,
			maxBufferBytes: 1_024,
		});

		// Push 2 KiB of a single \n-less line — past the 1 KiB cap.
		channel.pushBytes('x'.repeat(2_048));
		expect(overflow).toHaveBeenCalledTimes(1);
		expect(overflow).toHaveBeenCalledWith(2_048);
		expect(channel.overflowCount).toBe(1);
	});

	it('drops further chunks after overflow so we do not grow the buffer', () => {
		const seen: string[] = [];
		const overflow = vi.fn();
		const channel = createNdjsonChannel<unknown>({
			onLine: (l) => seen.push(l),
			onOverflow: overflow,
			maxBufferBytes: 32,
		});

		channel.pushBytes('x'.repeat(64));
		channel.pushBytes('legitimate-line\n');
		expect(overflow).toHaveBeenCalledTimes(1);
		expect(channel.overflowCount).toBe(1);
		expect(seen).toEqual([]);
	});

	it('does not overflow when many small lines arrive even if total exceeds cap', () => {
		const seen: string[] = [];
		const overflow = vi.fn();
		const channel = createNdjsonChannel<unknown>({
			onLine: (l) => seen.push(l),
			onOverflow: overflow,
			maxBufferBytes: 16,
		});
		// 1 KiB total across 64 small lines — the unflushed tail never exceeds 16 chars.
		for (let i = 0; i < 64; i += 1) {
			channel.pushBytes('line\n');
		}
		expect(overflow).not.toHaveBeenCalled();
		expect(seen).toHaveLength(64);
	});

	it('defaults to 4 MiB cap when maxBufferBytes is omitted', () => {
		expect(DEFAULT_STDOUT_MAX_BYTES).toBe(4 * 1024 * 1024);
		const overflow = vi.fn();
		const channel = createNdjsonChannel<unknown>({
			onLine: () => undefined,
			onOverflow: overflow,
		});
		channel.pushBytes('x'.repeat(1024));
		expect(overflow).not.toHaveBeenCalled();
	});

	it('callback errors do not crash the pump', () => {
		const channel = createNdjsonChannel<unknown>({
			onLine: () => undefined,
			onOverflow: () => {
				throw new Error('caller bug');
			},
			maxBufferBytes: 16,
		});
		expect(() => { channel.pushBytes('x'.repeat(64)); }).not.toThrow();
		expect(channel.overflowCount).toBe(1);
	});
});
