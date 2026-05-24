/**
 * T-CC-002 (TEST-CC-002) — RED: `StreamChunk` P1 union member names + shapes.
 *
 * Asserts the P1-emitted subset of the `StreamChunk` discriminated union mirrors
 * claudian-main `chat.ts:137` member NAMES and SHAPES exactly: there is **no**
 * `text-delta` and **no** `final` member, `done` is the terminator, and the P1
 * subset is `assistant_message_start?` | `text` | `error` | `done` | `usage`.
 * The compile-time discriminant extraction below fails `npm run typecheck`
 * (`tsconfig.lint.json` covers `tests/**`) until T-CC-003 declares the union.
 *
 * Traces: TEST-CC-002, SPEC-CC-002, REQ-CC-001a; ADR-CC-001 §4.
 */
import { describe, it, expect } from 'vitest';
import type { StreamChunk } from '@/domain/chat/StreamChunk';
import type { UsageInfo } from '@/domain/chat/UsageInfo';

/** Extract the literal `type` discriminant of every union member. */
type ChunkType = StreamChunk['type'];

/** Pull the member whose discriminant is `T`. */
type ChunkOf<T extends ChunkType> = Extract<StreamChunk, { type: T }>;

type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// ---- The forbidden member names must NOT exist (no text-delta, no final) ----
// `Extract` over an absent discriminant resolves to `never`; assert that.
const _noTextDelta: Equals<Extract<StreamChunk, { type: 'text-delta' }>, never> = true;
const _noFinal: Equals<Extract<StreamChunk, { type: 'final' }>, never> = true;
void _noTextDelta;
void _noFinal;

// ---- The five P1-emitted members exist with the exact chat.ts:137 shapes ----
const _textShape: Equals<ChunkOf<'text'>, { type: 'text'; content: string }> = true;
const _errorShape: Equals<ChunkOf<'error'>, { type: 'error'; content: string }> = true;
const _doneShape: Equals<ChunkOf<'done'>, { type: 'done' }> = true;
const _startShape: Equals<
	ChunkOf<'assistant_message_start'>,
	{ type: 'assistant_message_start'; itemId?: string }
> = true;
const _usageShape: Equals<
	ChunkOf<'usage'>,
	{ type: 'usage'; usage: UsageInfo; sessionId?: string | null }
> = true;
void _textShape;
void _errorShape;
void _doneShape;
void _startShape;
void _usageShape;

describe('StreamChunk P1 union (TEST-CC-002)', () => {
	it('declares the five P1-emitted members with chat.ts:137 shapes', () => {
		const text: StreamChunk = { type: 'text', content: 'Hel' };
		const err: StreamChunk = { type: 'error', content: 'boom' };
		const done: StreamChunk = { type: 'done' };
		const start: StreamChunk = { type: 'assistant_message_start', itemId: 'a1' };
		const usage: StreamChunk = {
			type: 'usage',
			usage: { inputTokens: 1, contextWindow: 200000, contextTokens: 1, percentage: 0 },
			sessionId: 's1',
		};
		expect([text.type, err.type, done.type, start.type, usage.type]).toEqual([
			'text',
			'error',
			'done',
			'assistant_message_start',
			'usage',
		]);
	});

	it('has no text-delta and no final member (compile-time + runtime sentinel)', () => {
		// Runtime sentinel mirrors the compile-time `_noTextDelta`/`_noFinal` asserts above.
		const all: StreamChunk[] = [{ type: 'text', content: '' }, { type: 'done' }];
		const names = all.map((c) => c.type);
		expect(names).not.toContain('text-delta');
		expect(names).not.toContain('final');
	});
});
