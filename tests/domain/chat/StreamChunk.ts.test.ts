/**
 * T-CP-002 (TEST-CP-001) — RED: `StreamChunk` gains EXACTLY the three P4 request
 * members `ask_user_question` / `exit_plan_mode` / `approval_request`, with the
 * P1/P2/P3 union members byte-identical (additivity, SPEC-CP-034).
 *
 * Fails `vue-tsc -p tsconfig.lint.json` until T-CP-004 appends the three members
 * (and T-CP-003 supplies the inline DTOs they reference).
 *
 * Traces: TEST-CP-001, SPEC-CP-001, SPEC-CP-034, REQ-CP-022/024/026, NFR-CP-009.
 */
import { describe, it, expect } from 'vitest';
import type { StreamChunk } from '@/domain/chat/StreamChunk';
import type { AskUserQuestionItem, ApprovalOption } from '@/domain/chat/inline';

type ChunkType = StreamChunk['type'];
type ChunkOf<T extends ChunkType> = Extract<StreamChunk, { type: T }>;
type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// ---- the three P4 request members exist with the SPEC-CP-001 shapes ----
const _askShape: Equals<
	ChunkOf<'ask_user_question'>,
	{ type: 'ask_user_question'; requestId: string; questions: AskUserQuestionItem[] }
> = true;
const _exitShape: Equals<
	ChunkOf<'exit_plan_mode'>,
	{
		type: 'exit_plan_mode';
		requestId: string;
		plan: string;
		allowedPrompts?: { tool: string; prompt: string }[];
	}
> = true;
const _approvalShape: Equals<
	ChunkOf<'approval_request'>,
	{ type: 'approval_request'; requestId: string; tool: string; context: string; options: ApprovalOption[] }
> = true;
void _askShape;
void _exitShape;
void _approvalShape;

// ---- the union grew by EXACTLY three members vs the P1/P2/P3 surface ----
// Enumerate every discriminant; assert the set equals the prior 17 + the new 3.
type ExpectedChunkTypes =
	// P1/P2/P3 members (byte-identical)
	| 'assistant_message_start'
	| 'text'
	| 'error'
	| 'done'
	| 'usage'
	| 'user_message_start'
	| 'thinking'
	| 'tool_use'
	| 'tool_result'
	| 'tool_output'
	| 'notice'
	| 'context_compacted'
	| 'async_subagent_result'
	| 'subagent_tool_use'
	| 'subagent_tool_result'
	// the three P4 additive request members
	| 'ask_user_question'
	| 'exit_plan_mode'
	| 'approval_request';
const _exactTypes: Equals<ChunkType, ExpectedChunkTypes> = true;
void _exactTypes;

// P1/P2/P3 members stay byte-identical (sampled invariants).
const _textShape: Equals<ChunkOf<'text'>, { type: 'text'; content: string }> = true;
const _doneShape: Equals<ChunkOf<'done'>, { type: 'done'; assistantMessageId?: string }> = true;
void _textShape;
void _doneShape;

describe('StreamChunk P4 additive request members (TEST-CP-001)', () => {
	it('constructs the three request members', () => {
		const ask: StreamChunk = {
			type: 'ask_user_question',
			requestId: 'r1',
			questions: [{ id: 'q1', question: 'pick', options: [{ id: 'o1', label: 'A' }] }],
		};
		const exit: StreamChunk = { type: 'exit_plan_mode', requestId: 'r2', plan: 'the plan' };
		const approval: StreamChunk = {
			type: 'approval_request',
			requestId: 'r3',
			tool: 'Bash',
			context: 'run',
			options: [{ decision: 'allow', label: 'Allow once' }],
		};
		expect([ask.type, exit.type, approval.type]).toEqual([
			'ask_user_question',
			'exit_plan_mode',
			'approval_request',
		]);
	});

	it('keeps no text-delta / no final member (additivity preserved)', () => {
		const names: ChunkType[] = [
			'assistant_message_start',
			'text',
			'error',
			'done',
			'usage',
			'ask_user_question',
			'exit_plan_mode',
			'approval_request',
		];
		expect(names).not.toContain('text-delta');
		expect(names).not.toContain('final');
	});
});
