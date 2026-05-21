/**
 * Tests for `StreamDeltaReducer` — the codec seam between transport adapters
 * and the chat store (ADR-0034). Each test feeds a wire-format event table
 * and asserts the exact `StreamDelta[]` output. Wire events come from two
 * adapters (SDK in-process + subprocess NDJSON), so both shapes are covered.
 */
import { describe, it, expect } from 'vitest';

import {
	StreamDeltaReducer,
	type RawClaudeEvent,
} from '@/application/chat/StreamDeltaReducer';
import { ChatTransportError, type StreamDelta } from '@/domain/ports/ChatTransportPort';

// -----------------------------------------------------------------------------
// Convenience helpers — flatten the typing for readability in tests.
// -----------------------------------------------------------------------------

const TURN_ID = 'turn-xyz';

function reducer(): StreamDeltaReducer {
	return new StreamDeltaReducer({ turnId: TURN_ID });
}

function consumeAll(events: RawClaudeEvent[]): StreamDelta[] {
	const r = reducer();
	const out: StreamDelta[] = [];
	for (const ev of events) {
		for (const d of r.consume(ev)) out.push(d);
	}
	return out;
}

// =============================================================================
// 1. session-id single-fire
// =============================================================================

describe('StreamDeltaReducer — session-id', () => {
	it('emits one session-id delta on the first non-empty system-init event', () => {
		const out = consumeAll([
			{ kind: 'system-init', sessionId: 'sess-1' },
			{ kind: 'result', subtype: 'success', result: 'ok' },
		]);
		const sids = out.filter((d) => d.type === 'session-id');
		expect(sids).toHaveLength(1);
		expect(sids[0]).toEqual({ type: 'session-id', sessionId: 'sess-1' });
	});

	it('ignores subsequent system-init events (single-fire)', () => {
		const out = consumeAll([
			{ kind: 'system-init', sessionId: 'first' },
			{ kind: 'system-init', sessionId: 'second' },
			{ kind: 'result', subtype: 'success', result: 'ok' },
		]);
		const sids = out.filter((d) => d.type === 'session-id');
		expect(sids).toHaveLength(1);
		expect(sids[0]).toEqual({ type: 'session-id', sessionId: 'first' });
	});

	it('ignores system-init with null sessionId', () => {
		const out = consumeAll([
			{ kind: 'system-init', sessionId: null },
			{ kind: 'system-init', sessionId: '' },
			{ kind: 'result', subtype: 'success', result: 'ok' },
		]);
		expect(out.filter((d) => d.type === 'session-id')).toHaveLength(0);
	});
});

// =============================================================================
// 2. compact-boundary
// =============================================================================

describe('StreamDeltaReducer — compact-boundary', () => {
	it('emits compact-boundary without reason when reason is absent', () => {
		const r = reducer();
		const out = [...r.consume({ kind: 'system-compact-boundary' })];
		expect(out).toEqual([{ type: 'compact-boundary' }]);
	});

	it('emits compact-boundary with reason when present', () => {
		const r = reducer();
		const out = [
			...r.consume({ kind: 'system-compact-boundary', reason: 'token_budget' }),
		];
		expect(out).toEqual([{ type: 'compact-boundary', reason: 'token_budget' }]);
	});

	it('treats empty-string reason as absent', () => {
		const r = reducer();
		const out = [...r.consume({ kind: 'system-compact-boundary', reason: '' })];
		expect(out).toEqual([{ type: 'compact-boundary' }]);
	});
});

// =============================================================================
// 3. text_delta → text
// =============================================================================

describe('StreamDeltaReducer — text deltas', () => {
	it('emits one text delta per non-empty text_delta event', () => {
		const r = reducer();
		const out: StreamDelta[] = [];
		for (const d of r.consume({
			kind: 'stream-event',
			event: {
				type: 'content_block_start',
				index: 0,
				content_block: { type: 'text' },
			},
		})) out.push(d);
		for (const d of r.consume({
			kind: 'stream-event',
			event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello ' } },
		})) out.push(d);
		for (const d of r.consume({
			kind: 'stream-event',
			event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'world' } },
		})) out.push(d);

		expect(out).toEqual([
			{ type: 'text', text: 'Hello ' },
			{ type: 'text', text: 'world' },
		]);
	});

	it('drops empty text_delta events', () => {
		const r = reducer();
		const out = [
			...r.consume({
				kind: 'stream-event',
				event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '' } },
			}),
		];
		expect(out).toEqual([]);
	});
});

// =============================================================================
// 4. thinking_delta → thinking
// =============================================================================

describe('StreamDeltaReducer — thinking deltas', () => {
	it('emits one thinking delta per non-empty thinking_delta event', () => {
		const r = reducer();
		const out = [
			...r.consume({
				kind: 'stream-event',
				event: {
					type: 'content_block_delta',
					index: 0,
					delta: { type: 'thinking_delta', thinking: 'pondering' },
				},
			}),
		];
		expect(out).toEqual([{ type: 'thinking', text: 'pondering' }]);
	});

	it('drops empty thinking_delta events', () => {
		const r = reducer();
		const out = [
			...r.consume({
				kind: 'stream-event',
				event: {
					type: 'content_block_delta',
					index: 0,
					delta: { type: 'thinking_delta', thinking: '' },
				},
			}),
		];
		expect(out).toEqual([]);
	});
});

// =============================================================================
// 5. tool_use block lifecycle (start / input-delta / stop) + blockId mint
// =============================================================================

describe('StreamDeltaReducer — tool_use blocks', () => {
	it('mints stable blockId of the form ${turnId}-${messageSeq}-${index}', () => {
		const r = reducer();
		const out: StreamDelta[] = [];
		// message_start bumps messageSeq from 0 → 1.
		for (const d of r.consume({
			kind: 'stream-event',
			event: { type: 'message_start' },
		})) out.push(d);
		for (const d of r.consume({
			kind: 'stream-event',
			event: {
				type: 'content_block_start',
				index: 2,
				content_block: { type: 'tool_use', name: 'Bash', input: {} },
			},
		})) out.push(d);
		for (const d of r.consume({
			kind: 'stream-event',
			event: {
				type: 'content_block_delta',
				index: 2,
				delta: { type: 'input_json_delta', partial_json: '{"cmd":"' },
			},
		})) out.push(d);
		for (const d of r.consume({
			kind: 'stream-event',
			event: {
				type: 'content_block_delta',
				index: 2,
				delta: { type: 'input_json_delta', partial_json: 'ls"}' },
			},
		})) out.push(d);
		for (const d of r.consume({
			kind: 'stream-event',
			event: { type: 'content_block_stop', index: 2 },
		})) out.push(d);

		const expectedBlockId = `${TURN_ID}-1-2`;
		expect(out).toEqual([
			{ type: 'tool-use-start', blockId: expectedBlockId, toolName: 'Bash', inputJson: '' },
			{ type: 'tool-use-input-delta', blockId: expectedBlockId, inputJson: '{"cmd":"' },
			{ type: 'tool-use-input-delta', blockId: expectedBlockId, inputJson: 'ls"}' },
			{ type: 'tool-use-stop', blockId: expectedBlockId },
		]);
	});

	it('accepts blocks whose type ends with tool_use (server_tool_use)', () => {
		const r = reducer();
		const out = [
			...r.consume({
				kind: 'stream-event',
				event: {
					type: 'content_block_start',
					index: 0,
					content_block: { type: 'server_tool_use', name: 'webfetch', input: {} },
				},
			}),
		];
		expect(out).toEqual([
			{ type: 'tool-use-start', blockId: `${TURN_ID}-0-0`, toolName: 'webfetch', inputJson: '' },
		]);
	});

	it('seeds inputJson to empty string, NOT to the placeholder {} payload', () => {
		const r = reducer();
		const out = [
			...r.consume({
				kind: 'stream-event',
				event: {
					type: 'content_block_start',
					index: 0,
					content_block: { type: 'tool_use', name: 'Bash', input: {} },
				},
			}),
		];
		expect(out).toHaveLength(1);
		const d = out[0];
		expect(d.type).toBe('tool-use-start');
		if (d.type === 'tool-use-start') expect(d.inputJson).toBe('');
	});

	it('falls back to "unknown" toolName when name is absent', () => {
		const r = reducer();
		const out = [
			...r.consume({
				kind: 'stream-event',
				event: {
					type: 'content_block_start',
					index: 0,
					content_block: { type: 'tool_use', input: {} },
				},
			}),
		];
		expect(out).toHaveLength(1);
		const d = out[0];
		if (d.type === 'tool-use-start') expect(d.toolName).toBe('unknown');
	});

	it('ignores input_json_delta whose index has no tracked tool_use block', () => {
		const r = reducer();
		const out = [
			...r.consume({
				kind: 'stream-event',
				event: {
					type: 'content_block_delta',
					index: 7,
					delta: { type: 'input_json_delta', partial_json: '{}' },
				},
			}),
		];
		expect(out).toEqual([]);
	});

	it('emits no stop delta for text or thinking blocks (only tool_use)', () => {
		const r = reducer();
		void r.consume({
			kind: 'stream-event',
			event: {
				type: 'content_block_start',
				index: 0,
				content_block: { type: 'text' },
			},
		});
		const out = [
			...r.consume({
				kind: 'stream-event',
				event: { type: 'content_block_stop', index: 0 },
			}),
		];
		expect(out).toEqual([]);
	});
});

// =============================================================================
// 6. messageSeq isolation — multi-step tool loop, index reuse across messages
// =============================================================================

describe('StreamDeltaReducer — messageSeq isolation', () => {
	it('produces distinct blockIds for the same index across two messages', () => {
		const r = reducer();
		const startBlock = (index: number): RawClaudeEvent => ({
			kind: 'stream-event',
			event: {
				type: 'content_block_start',
				index,
				content_block: { type: 'tool_use', name: 'Bash', input: {} },
			},
		});

		const out: StreamDelta[] = [];
		for (const d of r.consume({ kind: 'stream-event', event: { type: 'message_start' } })) out.push(d);
		for (const d of r.consume(startBlock(0))) out.push(d);
		// Multi-step: second message_start resets index → 0 again.
		for (const d of r.consume({ kind: 'stream-event', event: { type: 'message_start' } })) out.push(d);
		for (const d of r.consume(startBlock(0))) out.push(d);

		const startIds = out
			.filter((d): d is Extract<StreamDelta, { type: 'tool-use-start' }> => d.type === 'tool-use-start')
			.map((d) => d.blockId);
		expect(startIds).toEqual([`${TURN_ID}-1-0`, `${TURN_ID}-2-0`]);
		expect(startIds[0]).not.toBe(startIds[1]);
	});
});

// =============================================================================
// 7. usage merge (Codex P2 partial-usage)
// =============================================================================

describe('StreamDeltaReducer — usage merging', () => {
	it('reads usage from message_start (nested under message.usage)', () => {
		const r = reducer();
		const out = [
			...r.consume({
				kind: 'stream-event',
				event: {
					type: 'message_start',
					message: { usage: { input_tokens: 11, output_tokens: 22 } },
				},
			}),
		];
		expect(out).toEqual([{ type: 'usage', inputTokens: 11, outputTokens: 22 }]);
	});

	it('reads usage from message_delta (direct event.usage)', () => {
		const r = reducer();
		const out = [
			...r.consume({
				kind: 'stream-event',
				event: { type: 'message_delta', usage: { input_tokens: 1, output_tokens: 99 } },
			}),
		];
		expect(out).toEqual([{ type: 'usage', inputTokens: 1, outputTokens: 99 }]);
	});

	it('merges partial message_delta.usage against the prior frame (input unchanged)', () => {
		const r = reducer();
		void r.consume({
			kind: 'stream-event',
			event: {
				type: 'message_start',
				message: { usage: { input_tokens: 50, output_tokens: 1 } },
			},
		});
		// message_delta carries output_tokens only — `input_tokens` must stay 50.
		const out = [
			...r.consume({
				kind: 'stream-event',
				event: { type: 'message_delta', usage: { output_tokens: 7 } },
			}),
		];
		expect(out).toEqual([{ type: 'usage', inputTokens: 50, outputTokens: 7 }]);
	});

	it('skips zero-zero usage noise from message_start before any tokens', () => {
		const r = reducer();
		const out = [
			...r.consume({
				kind: 'stream-event',
				event: {
					type: 'message_start',
					message: { usage: { input_tokens: 0, output_tokens: 0 } },
				},
			}),
		];
		expect(out).toEqual([]);
	});

	it('suppresses redundant usage emits when nothing changed', () => {
		const r = reducer();
		void r.consume({
			kind: 'stream-event',
			event: {
				type: 'message_start',
				message: { usage: { input_tokens: 5, output_tokens: 6 } },
			},
		});
		const out = [
			...r.consume({
				kind: 'stream-event',
				event: { type: 'message_delta', usage: { input_tokens: 5, output_tokens: 6 } },
			}),
		];
		expect(out).toEqual([]);
	});
});

// =============================================================================
// 8. Subprocess dedup invariant — Perf F-2 / Claudian PR #510
// =============================================================================

describe('StreamDeltaReducer — assistant-message dedup', () => {
	it('drops whole-message text after a text_delta in the same message', () => {
		const r = reducer();
		const out: StreamDelta[] = [];
		// Stream a per-token text_delta for message 1.
		for (const d of r.consume({ kind: 'stream-event', event: { type: 'message_start' } })) out.push(d);
		for (const d of r.consume({
			kind: 'stream-event',
			event: {
				type: 'content_block_delta',
				index: 0,
				delta: { type: 'text_delta', text: 'Hello' },
			},
		})) out.push(d);
		// Subprocess transport ALSO emits the whole assistant message body.
		// Dedup must drop it.
		for (const d of r.consume({ kind: 'assistant-message', text: 'Hello' })) out.push(d);

		const texts = out.filter((d) => d.type === 'text');
		expect(texts).toHaveLength(1);
		expect(texts[0]).toEqual({ type: 'text', text: 'Hello' });
	});

	it('emits whole-message text when no text_delta has been seen yet', () => {
		const r = reducer();
		const out = [
			...r.consume({ kind: 'assistant-message', text: 'one-shot' }),
		];
		expect(out).toEqual([{ type: 'text', text: 'one-shot' }]);
	});

	it('emits multiple whole-message assistant texts when no text_delta has been seen', () => {
		// The dedup invariant is one-way: text_delta seen → drop subsequent
		// whole-message text. CLI streams that emit whole-message events
		// incrementally (text-by-text) must NOT be deduplicated against each
		// other — only against per-token text_delta events.
		const r = reducer();
		const out: StreamDelta[] = [];
		for (const d of r.consume({ kind: 'assistant-message', text: 'Hello' })) out.push(d);
		for (const d of r.consume({ kind: 'assistant-message', text: ' ' })) out.push(d);
		for (const d of r.consume({ kind: 'assistant-message', text: 'world' })) out.push(d);
		expect(out.filter((d) => d.type === 'text')).toEqual([
			{ type: 'text', text: 'Hello' },
			{ type: 'text', text: ' ' },
			{ type: 'text', text: 'world' },
		]);
	});

	it('drops empty whole-message text', () => {
		const r = reducer();
		const out = [...r.consume({ kind: 'assistant-message', text: '' })];
		expect(out).toEqual([]);
	});

	it('resets dedup scope on each message_start (whole-message text after message_start emits)', () => {
		const r = reducer();
		// Message 1: text_delta sets the dedup flag.
		void r.consume({ kind: 'stream-event', event: { type: 'message_start' } });
		void r.consume({
			kind: 'stream-event',
			event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'm1' } },
		});
		// Message 2 begins — dedup flag must reset.
		void r.consume({ kind: 'stream-event', event: { type: 'message_start' } });
		const out = [...r.consume({ kind: 'assistant-message', text: 'whole-m2' })];
		expect(out).toEqual([{ type: 'text', text: 'whole-m2' }]);
	});
});

// =============================================================================
// 9. result → done + fallback text + error path
// =============================================================================

describe('StreamDeltaReducer — result termination', () => {
	it('emits done after a successful result with no preceding text', () => {
		const out = consumeAll([{ kind: 'result', subtype: 'success' }]);
		expect(out).toEqual([{ type: 'done' }]);
	});

	it('emits [text, done] when no text was produced and result.result is non-empty', () => {
		const out = consumeAll([{ kind: 'result', subtype: 'success', result: 'fallback' }]);
		expect(out).toEqual([
			{ type: 'text', text: 'fallback' },
			{ type: 'done' },
		]);
	});

	it('emits only done when text was already produced (skip fallback)', () => {
		const r = reducer();
		const out: StreamDelta[] = [];
		for (const d of r.consume({
			kind: 'stream-event',
			event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'streamed' } },
		})) out.push(d);
		for (const d of r.consume({
			kind: 'result',
			subtype: 'success',
			result: 'fallback (should drop)',
		})) out.push(d);
		expect(out).toEqual([
			{ type: 'text', text: 'streamed' },
			{ type: 'done' },
		]);
	});

	it('maps SDK error-subtype result to terminal error', () => {
		const out = consumeAll([{ kind: 'result', subtype: 'error_max_turns' }]);
		expect(out).toHaveLength(1);
		expect(out[0].type).toBe('error');
		if (out[0].type === 'error') {
			expect(out[0].error).toBeInstanceOf(ChatTransportError);
			expect(out[0].error.errorCode).toBe('QUERY_FAILED');
			expect(out[0].error.message).toContain('error_max_turns');
		}
	});

	it('maps subprocess is_error: true result to terminal error', () => {
		const out = consumeAll([{ kind: 'result', is_error: true, result: 'boom' }]);
		expect(out).toHaveLength(1);
		expect(out[0].type).toBe('error');
		if (out[0].type === 'error') expect(out[0].error.errorCode).toBe('QUERY_FAILED');
	});

	it('returns empty arrays after the terminal delta (idempotent termination)', () => {
		const r = reducer();
		const first = [...r.consume({ kind: 'result', subtype: 'success', result: 'ok' })];
		expect(first[first.length - 1]).toEqual({ type: 'done' });
		const second = [...r.consume({ kind: 'result', subtype: 'success', result: 'ignored' })];
		expect(second).toEqual([]);
		expect(r.terminated).toBe(true);
	});
});

// =============================================================================
// 10. emitError — out-of-band terminal error (transport-level failures)
// =============================================================================

describe('StreamDeltaReducer — emitError', () => {
	it('emits a terminal error delta and marks the reducer terminated', () => {
		const r = reducer();
		const err = new ChatTransportError('TIMEOUT', 'too slow');
		const out = [...r.emitError(err)];
		expect(out).toEqual([{ type: 'error', error: err }]);
		expect(r.terminated).toBe(true);
	});

	it('is idempotent once terminated', () => {
		const r = reducer();
		void r.emitError(new ChatTransportError('TIMEOUT', 'a'));
		const out = [...r.emitError(new ChatTransportError('QUERY_FAILED', 'b'))];
		expect(out).toEqual([]);
	});

	it('returns empty when called after a successful result', () => {
		const r = reducer();
		void r.consume({ kind: 'result', subtype: 'success', result: 'ok' });
		const out = [...r.emitError(new ChatTransportError('TIMEOUT', 'late'))];
		expect(out).toEqual([]);
	});
});

// =============================================================================
// 11. reset()
// =============================================================================

describe('StreamDeltaReducer — reset', () => {
	it('clears messageSeq, blockKinds, sessionIdEmitted, textEmitted, lastUsage, terminated', () => {
		const r = reducer();
		void r.consume({ kind: 'system-init', sessionId: 'first' });
		void r.consume({ kind: 'stream-event', event: { type: 'message_start' } });
		void r.consume({
			kind: 'stream-event',
			event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'hi' } },
		});
		void r.consume({ kind: 'result', subtype: 'success' });

		expect(r.terminated).toBe(true);
		r.reset();
		expect(r.terminated).toBe(false);
		expect(r.hasText()).toBe(false);

		// After reset, session-id may fire again.
		const out = [...r.consume({ kind: 'system-init', sessionId: 'second' })];
		expect(out).toEqual([{ type: 'session-id', sessionId: 'second' }]);
	});
});

// =============================================================================
// 12. consume()'s no-op behaviour on unknown / malformed wire events
// =============================================================================

describe('StreamDeltaReducer — defensive no-ops', () => {
	it('ignores stream-event with unknown inner type', () => {
		const r = reducer();
		const out = [
			...r.consume({ kind: 'stream-event', event: { type: 'some_future_event' } }),
		];
		expect(out).toEqual([]);
	});

	it('ignores content_block_start without index or content_block', () => {
		const r = reducer();
		const out1 = [
			...r.consume({
				kind: 'stream-event',
				event: { type: 'content_block_start', content_block: { type: 'text' } },
			}),
		];
		const out2 = [
			...r.consume({
				kind: 'stream-event',
				event: { type: 'content_block_start', index: 0 },
			}),
		];
		expect(out1).toEqual([]);
		expect(out2).toEqual([]);
	});

	it('ignores content_block_delta without index or delta', () => {
		const r = reducer();
		const out1 = [
			...r.consume({
				kind: 'stream-event',
				event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'x' } },
			}),
		];
		const out2 = [
			...r.consume({ kind: 'stream-event', event: { type: 'content_block_delta', index: 0 } }),
		];
		expect(out1).toEqual([]);
		expect(out2).toEqual([]);
	});

	it('ignores content_block_stop without index', () => {
		const r = reducer();
		const out = [
			...r.consume({ kind: 'stream-event', event: { type: 'content_block_stop' } }),
		];
		expect(out).toEqual([]);
	});

	it('ignores content_block_stop for unknown index', () => {
		const r = reducer();
		const out = [
			...r.consume({ kind: 'stream-event', event: { type: 'content_block_stop', index: 99 } }),
		];
		expect(out).toEqual([]);
	});

	it('ignores content_block_delta with unknown delta type', () => {
		const r = reducer();
		const out = [
			...r.consume({
				kind: 'stream-event',
				event: {
					type: 'content_block_delta',
					index: 0,
					delta: { type: 'future_delta_kind' },
				},
			}),
		];
		expect(out).toEqual([]);
	});
});
