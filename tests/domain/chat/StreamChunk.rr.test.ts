/**
 * T-RR-002 (TEST-RR-001) — RED: the `StreamChunk` P2 members diff clean vs
 * claudian-main `chat.ts:137`, with `tool_result`/`subagent_tool_result`
 * carrying `toolUseResult?: ToolUseResult` (no longer `unknown`), every P1
 * member byte-identical, and no member renamed.
 *
 * The compile-time `Equals<>` asserts on the typed `toolUseResult` fail
 * `npx vue-tsc --noEmit -p tsconfig.lint.json` until T-RR-006 makes the typing
 * edit + T-RR-004 declares `ToolUseResult`. (P1 members remain green.)
 *
 * Traces: TEST-RR-001, SPEC-RR-001, REQ-RR-001; ADR-RR-001 §1.
 */
import { describe, it, expect } from 'vitest';
import type { StreamChunk } from '@/domain/chat/StreamChunk';
import type { UsageInfo } from '@/domain/chat/UsageInfo';
import type { ToolUseResult } from '@/domain/chat/diff/ToolUseResult';

type ChunkType = StreamChunk['type'];
type ChunkOf<T extends ChunkType> = Extract<StreamChunk, { type: T }>;

type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// ---- P1 members byte-identical (no rename, no reshape) ----
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

// ---- the ONE P2 edit: tool_result / subagent_tool_result toolUseResult is typed ----
const _toolResultTyped: Equals<
	ChunkOf<'tool_result'>,
	{ type: 'tool_result'; id: string; content: string; isError?: boolean; toolUseResult?: ToolUseResult }
> = true;
const _subagentToolResultTyped: Equals<
	ChunkOf<'subagent_tool_result'>,
	{
		type: 'subagent_tool_result';
		subagentId: string;
		id: string;
		content: string;
		isError?: boolean;
		toolUseResult?: ToolUseResult;
	}
> = true;
void _toolResultTyped;
void _subagentToolResultTyped;

// ---- P2 emitted members exist with the chat.ts:137 shapes (no rename) ----
const _thinking: Equals<ChunkOf<'thinking'>, { type: 'thinking'; content: string }> = true;
const _toolUse: Equals<
	ChunkOf<'tool_use'>,
	{ type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
> = true;
const _toolOutput: Equals<
	ChunkOf<'tool_output'>,
	{ type: 'tool_output'; id: string; content: string }
> = true;
const _notice: Equals<
	ChunkOf<'notice'>,
	{ type: 'notice'; content: string; level?: 'info' | 'warning' }
> = true;
const _compacted: Equals<ChunkOf<'context_compacted'>, { type: 'context_compacted' }> = true;
const _asyncResult: Equals<
	ChunkOf<'async_subagent_result'>,
	{ type: 'async_subagent_result'; agentId: string; status: 'completed' | 'error'; result?: string }
> = true;
const _subagentToolUse: Equals<
	ChunkOf<'subagent_tool_use'>,
	{
		type: 'subagent_tool_use';
		subagentId: string;
		id: string;
		name: string;
		input: Record<string, unknown>;
	}
> = true;
void _thinking;
void _toolUse;
void _toolOutput;
void _notice;
void _compacted;
void _asyncResult;
void _subagentToolUse;

describe('StreamChunk P2 members (TEST-RR-001)', () => {
	it('keeps the alias name StreamChunk and the P1 members byte-identical', () => {
		const text: StreamChunk = { type: 'text', content: 'hi' };
		const usage: StreamChunk = {
			type: 'usage',
			usage: { inputTokens: 1, contextWindow: 200000, contextTokens: 1, percentage: 0 },
		};
		expect([text.type, usage.type]).toEqual(['text', 'usage']);
	});

	it('types tool_result.toolUseResult as ToolUseResult carrying structuredPatch', () => {
		const result: ToolUseResult = {
			structuredPatch: [{ oldStart: 1, oldLines: 0, newStart: 1, newLines: 1, lines: ['+x'] }],
		};
		const chunk: StreamChunk = {
			type: 'tool_result',
			id: 't1',
			content: 'done',
			isError: false,
			toolUseResult: result,
		};
		expect(chunk.type).toBe('tool_result');
	});

	it('emits the P2 member set without renaming any P1 member', () => {
		const members: StreamChunk[] = [
			{ type: 'thinking', content: 'hmm' },
			{ type: 'tool_use', id: 't1', name: 'Read', input: {} },
			{ type: 'tool_output', id: 't1', content: 'partial' },
			{ type: 'notice', content: 'fyi' },
			{ type: 'context_compacted' },
			{ type: 'async_subagent_result', agentId: 'a1', status: 'completed' },
			{ type: 'subagent_tool_use', subagentId: 's1', id: 't2', name: 'Grep', input: {} },
		];
		expect(members.map((m) => m.type)).not.toContain('text-delta');
	});
});
