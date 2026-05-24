/**
 * T-CC-010 (NDJSON→StreamChunk reduce) — unit test for the pure reducer seam of
 * `ClaudeCliChatRuntime`.
 *
 * SPEC-CC-010 "NDJSON → `StreamChunk` reduce" — the production runtime spawns the
 * `claude` CLI with `--output-format stream-json` and reduces each NDJSON stdout
 * line to zero-or-more `StreamChunk`s. The spawn + child lifecycle is the manual
 * TEST-CC-017 (coverage-excluded infra); the **reduce is pure and deterministic**,
 * so it is unit-tested here with canned CLI event fixtures.
 *
 * Reduce contract (SPEC-CC-010):
 *   - first assistant content → optional `assistant_message_start`, then `text`
 *     chunks for each text delta (accumulate; no `text-delta` member);
 *   - a usage/result event with token + session info → `usage` (+ captured sessionId);
 *   - a CLI error / parse failure on a line → `error` (friendly message);
 *   - stream end / final result event → exactly one `done`.
 *
 * Traces: SPEC-CC-010, REQ-CC-013, NFR-CC-003 (EC-13).
 */
import { describe, it, expect } from 'vitest';
import {
	ClaudeStreamReducer,
	type ClaudeStreamReducer as ClaudeStreamReducerType,
} from '@/infrastructure/obsidian/reduceClaudeStream';
import type { StreamChunk } from '@/domain/chat/StreamChunk';

function reduceAll(reducer: ClaudeStreamReducerType, lines: string[]): StreamChunk[] {
	const out: StreamChunk[] = [];
	for (const line of lines) out.push(...reducer.consumeLine(line));
	return out;
}

describe('ClaudeStreamReducer (SPEC-CC-010 NDJSON reduce)', () => {
	it('captures the session id from a system/init event without emitting a chunk', () => {
		const reducer = new ClaudeStreamReducer();
		const chunks = reducer.consumeLine(
			JSON.stringify({ type: 'system', subtype: 'init', session_id: 'sess-123' }),
		);
		expect(chunks).toEqual([]);
		expect(reducer.sessionId).toBe('sess-123');
	});

	it('maps an assistant message text block to a text chunk (accumulate, not text-delta)', () => {
		const reducer = new ClaudeStreamReducer();
		const chunks = reducer.consumeLine(
			JSON.stringify({
				type: 'assistant',
				message: { content: [{ type: 'text', text: 'Hello' }] },
			}),
		);
		// No `text-delta` member exists — assistant text maps to `text` chunks.
		expect(chunks).toContainEqual({ type: 'text', content: 'Hello' });
		expect(chunks.map((c) => c.type)).not.toContain('text-delta');
	});

	it('emits assistant_message_start at most once before the first text', () => {
		const reducer = new ClaudeStreamReducer();
		const first = reducer.consumeLine(
			JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Hel' }] } }),
		);
		const second = reducer.consumeLine(
			JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'lo' }] } }),
		);
		const starts = [...first, ...second].filter((c) => c.type === 'assistant_message_start');
		expect(starts.length).toBeLessThanOrEqual(1);
		// Concatenated text across the two assistant events = "Hello".
		const text = [...first, ...second]
			.filter((c): c is { type: 'text'; content: string } => c.type === 'text')
			.map((c) => c.content)
			.join('');
		expect(text).toBe('Hello');
	});

	it('maps a result event to a usage chunk (with captured sessionId) then a done', () => {
		const reducer = new ClaudeStreamReducer();
		reducer.consumeLine(JSON.stringify({ type: 'system', subtype: 'init', session_id: 'sess-9' }));
		const chunks = reducer.consumeLine(
			JSON.stringify({
				type: 'result',
				subtype: 'success',
				session_id: 'sess-9',
				usage: { input_tokens: 12, output_tokens: 8 },
			}),
		);
		const usage = chunks.find(
			(c): c is Extract<StreamChunk, { type: 'usage' }> => c.type === 'usage',
		);
		expect(usage).toBeDefined();
		expect(usage?.sessionId).toBe('sess-9');
		expect(usage?.usage.inputTokens).toBe(12);
		expect(chunks[chunks.length - 1]).toEqual({ type: 'done' });
	});

	it('maps a CLI error result to an error chunk then a done', () => {
		const reducer = new ClaudeStreamReducer();
		const chunks = reducer.consumeLine(
			JSON.stringify({ type: 'result', subtype: 'error_during_execution', is_error: true }),
		);
		expect(chunks.some((c) => c.type === 'error')).toBe(true);
		expect(chunks[chunks.length - 1]).toEqual({ type: 'done' });
	});

	it('maps an unparseable line to an error chunk and never throws', () => {
		const reducer = new ClaudeStreamReducer();
		let chunks: StreamChunk[] = [];
		expect(() => {
			chunks = reducer.consumeLine('{ this is not json');
		}).not.toThrow();
		expect(chunks.some((c) => c.type === 'error')).toBe(true);
	});

	it('ignores blank lines (no chunk)', () => {
		const reducer = new ClaudeStreamReducer();
		expect(reducer.consumeLine('')).toEqual([]);
		expect(reducer.consumeLine('   ')).toEqual([]);
	});

	it('reduces a full text…result transcript to text… usage done in order', () => {
		const reducer = new ClaudeStreamReducer();
		const chunks = reduceAll(reducer, [
			JSON.stringify({ type: 'system', subtype: 'init', session_id: 's1' }),
			JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Hi ' }] } }),
			JSON.stringify({
				type: 'assistant',
				message: { content: [{ type: 'text', text: 'there' }] },
			}),
			JSON.stringify({
				type: 'result',
				subtype: 'success',
				session_id: 's1',
				usage: { input_tokens: 3, output_tokens: 2 },
			}),
		]);
		const types = chunks.map((c) => c.type);
		expect(types).toContain('text');
		expect(types.indexOf('usage')).toBeLessThan(types.indexOf('done'));
		expect(types[types.length - 1]).toBe('done');
		const text = chunks
			.filter((c): c is { type: 'text'; content: string } => c.type === 'text')
			.map((c) => c.content)
			.join('');
		expect(text).toBe('Hi there');
	});

	it('exposes a friendly synthetic error helper that never throws', () => {
		const reducer = new ClaudeStreamReducer();
		const chunks = reducer.synthesizeError('spawn ENOENT');
		expect(chunks[0]?.type).toBe('error');
		expect(chunks[chunks.length - 1]).toEqual({ type: 'done' });
	});
});

/**
 * Terminal guarantee (Codex review #433, EC-13): the CLI line stream can end
 * without ever emitting a `result` event (early exit, stderr-only). `query()`
 * must still yield a terminal `done` so the consumer leaves the `streaming`
 * state; `finalize()` is the pure seam that decides the tail.
 *
 * Traces: SPEC-CC-010, NFR-CC-003 (EC-13), REQ-CC-005.
 */
describe('ClaudeStreamReducer.finalize() — terminal guarantee', () => {
	it('synthesizes error+done when the stream ended without any result event', () => {
		const reducer = new ClaudeStreamReducer();
		// Assistant text streamed, but the CLI exited before a `result` event.
		reducer.consumeLine(
			JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'partial' }] } }),
		);
		const tail = reducer.finalize();
		expect(tail.some((c) => c.type === 'error')).toBe(true);
		expect(tail[tail.length - 1]).toEqual({ type: 'done' });
	});

	it('synthesizes a terminal for a completely empty stream (no lines at all)', () => {
		const reducer = new ClaudeStreamReducer();
		const tail = reducer.finalize();
		expect(tail[tail.length - 1]).toEqual({ type: 'done' });
	});

	it('returns no extra chunks once a result event already emitted done', () => {
		const reducer = new ClaudeStreamReducer();
		reducer.consumeLine(JSON.stringify({ type: 'result', subtype: 'success' }));
		expect(reducer.finalize()).toEqual([]);
	});

	it('returns no extra chunks once synthesizeError already emitted a terminal', () => {
		const reducer = new ClaudeStreamReducer();
		reducer.synthesizeError('spawn ENOENT');
		expect(reducer.finalize()).toEqual([]);
	});

	it('is idempotent — a second finalize after the first yields nothing', () => {
		const reducer = new ClaudeStreamReducer();
		reducer.finalize();
		expect(reducer.finalize()).toEqual([]);
	});
});
