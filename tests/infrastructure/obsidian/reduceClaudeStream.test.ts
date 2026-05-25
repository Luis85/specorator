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

	// ── R-TS-001: surface the per-turn assistant id on the terminal `done` ───────

	it('R-TS-001: captures the assistant message id and surfaces it on the done chunk', () => {
		const reducer = new ClaudeStreamReducer();
		reducer.consumeLine(JSON.stringify({ type: 'system', subtype: 'init', session_id: 's1' }));
		reducer.consumeLine(
			JSON.stringify({
				type: 'assistant',
				message: { id: 'msg_turn_42', content: [{ type: 'text', text: 'Hi' }] },
			}),
		);
		const chunks = reducer.consumeLine(
			JSON.stringify({ type: 'result', subtype: 'success', session_id: 's1' }),
		);
		const done = chunks[chunks.length - 1];
		expect(done).toEqual({ type: 'done', assistantMessageId: 'msg_turn_42' });
	});

	it('R-TS-001: prefers the envelope uuid over the inner message id when both are present', () => {
		const reducer = new ClaudeStreamReducer();
		reducer.consumeLine(
			JSON.stringify({
				type: 'assistant',
				uuid: 'uuid-outer',
				message: { id: 'msg-inner', content: [{ type: 'text', text: 'Hi' }] },
			}),
		);
		const chunks = reducer.consumeLine(JSON.stringify({ type: 'result', subtype: 'success' }));
		const done = chunks[chunks.length - 1];
		expect(done).toEqual({ type: 'done', assistantMessageId: 'uuid-outer' });
	});

	it('R-TS-001: a turn with no assistant id emits a bare done (no assistantMessageId)', () => {
		const reducer = new ClaudeStreamReducer();
		reducer.consumeLine(
			JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Hi' }] } }),
		);
		const chunks = reducer.consumeLine(JSON.stringify({ type: 'result', subtype: 'success' }));
		expect(chunks[chunks.length - 1]).toEqual({ type: 'done' });
	});
});

/**
 * P2 rich-rendering defect fix (SPEC-RR-001 / SPEC-RR-010): the reducer must also
 * map the P2 content-block kinds from the REAL `claude --output-format stream-json`
 * wire format. Against the real CLI:
 *   - `tool_use` / `thinking` (+ `redacted_thinking`) arrive as `assistant` message
 *     content blocks (alongside `text`), preserving arrival order;
 *   - `tool_result` arrives as a `user` event content block (`tool_use_id`,
 *     `content` as string OR `[{type:'text',text}]` array, optional `is_error`),
 *     with the structured `toolUseResult` (Write/Edit `structuredPatch`) when present.
 *
 * The mappings mirror claudian `transformClaudeMessage.ts` (assistant `tool_use`/
 * `thinking`, user `tool_result`) + its `extractToolResultContent` helper.
 *
 * Traces: SPEC-RR-001, SPEC-RR-010, REQ-RR-001, REQ-RR-003/026.
 */
describe('ClaudeStreamReducer — P2 rich chunks from the real stream (SPEC-RR-001/010)', () => {
	it('maps an assistant tool_use block to a tool_use chunk', () => {
		const reducer = new ClaudeStreamReducer();
		const chunks = reducer.consumeLine(
			JSON.stringify({
				type: 'assistant',
				message: {
					content: [
						{ type: 'tool_use', id: 'toolu_1', name: 'Read', input: { file_path: '/a.ts' } },
					],
				},
			}),
		);
		expect(chunks).toContainEqual({
			type: 'tool_use',
			id: 'toolu_1',
			name: 'Read',
			input: { file_path: '/a.ts' },
		});
	});

	it('defaults a tool_use with absent/non-object input to an empty object', () => {
		const reducer = new ClaudeStreamReducer();
		const chunks = reducer.consumeLine(
			JSON.stringify({
				type: 'assistant',
				message: { content: [{ type: 'tool_use', id: 'toolu_2', name: 'Bash' }] },
			}),
		);
		const toolUse = chunks.find(
			(c): c is Extract<StreamChunk, { type: 'tool_use' }> => c.type === 'tool_use',
		);
		expect(toolUse).toBeDefined();
		expect(toolUse?.input).toEqual({});
	});

	it('maps an assistant thinking block to a thinking chunk', () => {
		const reducer = new ClaudeStreamReducer();
		const chunks = reducer.consumeLine(
			JSON.stringify({
				type: 'assistant',
				message: { content: [{ type: 'thinking', thinking: 'Let me reason about this.' }] },
			}),
		);
		expect(chunks).toContainEqual({ type: 'thinking', content: 'Let me reason about this.' });
	});

	it('maps a redacted_thinking block to a thinking chunk (empty content tolerated)', () => {
		const reducer = new ClaudeStreamReducer();
		const chunks = reducer.consumeLine(
			JSON.stringify({
				type: 'assistant',
				message: { content: [{ type: 'redacted_thinking', data: 'opaque' }] },
			}),
		);
		expect(chunks).toContainEqual({ type: 'thinking', content: '' });
	});

	it('preserves arrival order of text and tool_use within one assistant message', () => {
		const reducer = new ClaudeStreamReducer();
		const chunks = reducer.consumeLine(
			JSON.stringify({
				type: 'assistant',
				message: {
					content: [
						{ type: 'text', text: 'Reading the file' },
						{ type: 'tool_use', id: 'toolu_3', name: 'Read', input: { file_path: '/b.ts' } },
					],
				},
			}),
		);
		const ordered = chunks
			.filter((c) => c.type === 'text' || c.type === 'tool_use')
			.map((c) => c.type);
		expect(ordered).toEqual(['text', 'tool_use']);
	});

	it('maps a user tool_result block with string content to a tool_result chunk', () => {
		const reducer = new ClaudeStreamReducer();
		const chunks = reducer.consumeLine(
			JSON.stringify({
				type: 'user',
				message: {
					content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'file contents' }],
				},
			}),
		);
		expect(chunks).toContainEqual({
			type: 'tool_result',
			id: 'toolu_1',
			content: 'file contents',
			isError: false,
		});
	});

	it('stringifies a tool_result whose content is an array of text blocks', () => {
		const reducer = new ClaudeStreamReducer();
		const chunks = reducer.consumeLine(
			JSON.stringify({
				type: 'user',
				message: {
					content: [
						{
							type: 'tool_result',
							tool_use_id: 'toolu_4',
							content: [
								{ type: 'text', text: 'line one' },
								{ type: 'text', text: 'line two' },
							],
						},
					],
				},
			}),
		);
		const result = chunks.find(
			(c): c is Extract<StreamChunk, { type: 'tool_result' }> => c.type === 'tool_result',
		);
		expect(result).toBeDefined();
		expect(result?.id).toBe('toolu_4');
		expect(result?.content).toBe('line one\nline two');
	});

	it('flags an errored tool_result via isError', () => {
		const reducer = new ClaudeStreamReducer();
		const chunks = reducer.consumeLine(
			JSON.stringify({
				type: 'user',
				message: {
					content: [
						{ type: 'tool_result', tool_use_id: 'toolu_5', content: 'boom', is_error: true },
					],
				},
			}),
		);
		const result = chunks.find(
			(c): c is Extract<StreamChunk, { type: 'tool_result' }> => c.type === 'tool_result',
		);
		expect(result?.isError).toBe(true);
	});

	it('maps a structured toolUseResult (Write/Edit structuredPatch) onto the tool_result chunk', () => {
		const reducer = new ClaudeStreamReducer();
		const structured = {
			filePath: '/c.ts',
			structuredPatch: [
				{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 2, lines: [' a', '+b'] },
			],
		};
		const chunks = reducer.consumeLine(
			JSON.stringify({
				type: 'user',
				message: {
					content: [{ type: 'tool_result', tool_use_id: 'toolu_6', content: 'ok' }],
				},
				toolUseResult: structured,
			}),
		);
		const result = chunks.find(
			(c): c is Extract<StreamChunk, { type: 'tool_result' }> => c.type === 'tool_result',
		);
		expect(result?.toolUseResult).toEqual(structured);
	});

	it('omits toolUseResult when the user event carries no structured result', () => {
		const reducer = new ClaudeStreamReducer();
		const chunks = reducer.consumeLine(
			JSON.stringify({
				type: 'user',
				message: {
					content: [{ type: 'tool_result', tool_use_id: 'toolu_7', content: 'ok' }],
				},
			}),
		);
		const result = chunks.find(
			(c): c is Extract<StreamChunk, { type: 'tool_result' }> => c.type === 'tool_result',
		);
		expect(result).toBeDefined();
		expect(result && 'toolUseResult' in result).toBe(false);
	});

	it('ignores a genuinely unknown event type (forward-compatible default)', () => {
		const reducer = new ClaudeStreamReducer();
		expect(reducer.consumeLine(JSON.stringify({ type: 'stream_event', event: {} }))).toEqual([]);
	});
});

/**
 * R-RR-001 (P1 blocker) — the real-CLI reducer must also emit the P2 subagent /
 * async / compaction / notice members, mirroring claudian
 * `transformClaudeMessage.ts`. These are derived from the real
 * `--output-format stream-json` wire fields:
 *   - `parent_tool_use_id` (non-null) on an `assistant`/`user` message routes its
 *     `tool_use`/`tool_result` to `subagent_tool_use`/`subagent_tool_result`
 *     (`emitToolUse`/`emitToolResult` :23/:30); null/absent → top-level (current);
 *   - `system/subtype:'compact_boundary'` → `{type:'context_compacted'}` (:385);
 *   - `system/subtype:'task_notification'` (`task_id`/`status`/`summary`) →
 *     `{type:'async_subagent_result', agentId, status, result}` (:48/:387);
 *   - a blocked/denied `user` message (`isBlockedMessage`, :446) →
 *     `{type:'notice', content, level:'warning'}`.
 *
 * Traces: SPEC-RR-001, SPEC-RR-010, REQ-RR-006, REQ-RR-021a, CLAR-RR-010.
 */
describe('ClaudeStreamReducer — R-RR-001 subagent/async/compaction/notice parity', () => {
	it('routes a tool_use under a non-null parent_tool_use_id to subagent_tool_use', () => {
		const reducer = new ClaudeStreamReducer();
		const chunks = reducer.consumeLine(
			JSON.stringify({
				type: 'assistant',
				parent_tool_use_id: 'task-parent-1',
				message: {
					content: [
						{ type: 'tool_use', id: 'nested-1', name: 'Read', input: { file_path: '/x.ts' } },
					],
				},
			}),
		);
		expect(chunks).toContainEqual({
			type: 'subagent_tool_use',
			subagentId: 'task-parent-1',
			id: 'nested-1',
			name: 'Read',
			input: { file_path: '/x.ts' },
		});
		// It must NOT also emit the top-level tool_use member.
		expect(chunks.some((c) => c.type === 'tool_use')).toBe(false);
	});

	it('routes a tool_result under a non-null parent_tool_use_id to subagent_tool_result', () => {
		const reducer = new ClaudeStreamReducer();
		const chunks = reducer.consumeLine(
			JSON.stringify({
				type: 'user',
				parent_tool_use_id: 'task-parent-1',
				message: {
					content: [{ type: 'tool_result', tool_use_id: 'nested-1', content: 'nested out' }],
				},
			}),
		);
		expect(chunks).toContainEqual({
			type: 'subagent_tool_result',
			subagentId: 'task-parent-1',
			id: 'nested-1',
			content: 'nested out',
			isError: false,
		});
		expect(chunks.some((c) => c.type === 'tool_result')).toBe(false);
	});

	it('carries the structured toolUseResult onto a subagent_tool_result', () => {
		const reducer = new ClaudeStreamReducer();
		const structured = {
			filePath: '/n.ts',
			structuredPatch: [{ oldStart: 1, oldLines: 0, newStart: 1, newLines: 1, lines: ['+a'] }],
		};
		const chunks = reducer.consumeLine(
			JSON.stringify({
				type: 'user',
				parent_tool_use_id: 'task-parent-2',
				message: {
					content: [{ type: 'tool_result', tool_use_id: 'nested-2', content: 'ok' }],
				},
				toolUseResult: structured,
			}),
		);
		const result = chunks.find(
			(c): c is Extract<StreamChunk, { type: 'subagent_tool_result' }> =>
				c.type === 'subagent_tool_result',
		);
		expect(result?.toolUseResult).toEqual(structured);
	});

	it('keeps a null parent_tool_use_id on the top-level tool_use path (no regression)', () => {
		const reducer = new ClaudeStreamReducer();
		const chunks = reducer.consumeLine(
			JSON.stringify({
				type: 'assistant',
				parent_tool_use_id: null,
				message: {
					content: [{ type: 'tool_use', id: 't1', name: 'Read', input: { file_path: '/a.ts' } }],
				},
			}),
		);
		expect(chunks).toContainEqual({
			type: 'tool_use',
			id: 't1',
			name: 'Read',
			input: { file_path: '/a.ts' },
		});
		expect(chunks.some((c) => c.type === 'subagent_tool_use')).toBe(false);
	});

	it('maps system/compact_boundary to a context_compacted chunk', () => {
		const reducer = new ClaudeStreamReducer();
		const chunks = reducer.consumeLine(
			JSON.stringify({ type: 'system', subtype: 'compact_boundary' }),
		);
		expect(chunks).toEqual([{ type: 'context_compacted' }]);
	});

	it('maps system/task_notification (completed) to an async_subagent_result chunk', () => {
		const reducer = new ClaudeStreamReducer();
		const chunks = reducer.consumeLine(
			JSON.stringify({
				type: 'system',
				subtype: 'task_notification',
				task_id: 'agent-7',
				status: 'completed',
				summary: 'Did the thing.',
			}),
		);
		expect(chunks).toEqual([
			{ type: 'async_subagent_result', agentId: 'agent-7', status: 'completed', result: 'Did the thing.' },
		]);
	});

	it('normalises a non-completed task_notification status to error with a fallback result', () => {
		const reducer = new ClaudeStreamReducer();
		const chunks = reducer.consumeLine(
			JSON.stringify({
				type: 'system',
				subtype: 'task_notification',
				task_id: 'agent-8',
				status: 'failed',
			}),
		);
		const async = chunks.find(
			(c): c is Extract<StreamChunk, { type: 'async_subagent_result' }> =>
				c.type === 'async_subagent_result',
		);
		expect(async?.status).toBe('error');
		expect(async?.agentId).toBe('agent-8');
		expect(typeof async?.result).toBe('string');
		expect((async?.result ?? '').length).toBeGreaterThan(0);
	});

	it('ignores a task_notification with no task_id (no chunk, never throws)', () => {
		const reducer = new ClaudeStreamReducer();
		const chunks = reducer.consumeLine(
			JSON.stringify({ type: 'system', subtype: 'task_notification', status: 'completed' }),
		);
		expect(chunks).toEqual([]);
	});

	it('emits a warning notice for a blocked/denied user message (isBlockedMessage parity)', () => {
		const reducer = new ClaudeStreamReducer();
		const chunks = reducer.consumeLine(
			JSON.stringify({
				type: 'user',
				_blocked: true,
				_blockReason: 'Tool use blocked: outside the vault.',
				message: { content: [] },
			}),
		);
		expect(chunks).toEqual([
			{ type: 'notice', content: 'Tool use blocked: outside the vault.', level: 'warning' },
		]);
	});

	it('does not emit a tool_result when a blocked user message also carries a result block', () => {
		const reducer = new ClaudeStreamReducer();
		const chunks = reducer.consumeLine(
			JSON.stringify({
				type: 'user',
				_blocked: true,
				_blockReason: 'user denied',
				message: {
					content: [{ type: 'tool_result', tool_use_id: 'x', content: 'should be skipped' }],
				},
			}),
		);
		// claudian breaks out after the notice (:452) — the result block is not emitted.
		expect(chunks).toEqual([{ type: 'notice', content: 'user denied', level: 'warning' }]);
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
