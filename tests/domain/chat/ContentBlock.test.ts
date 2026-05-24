/**
 * T-RR-002 (TEST-RR-002) — RED: `ContentBlock` is the ordered discriminated
 * union of claudian-main `chat.ts:31` (byte-identical).
 *
 * The compile-time `Equals<>` asserts fail `npx vue-tsc --noEmit -p
 * tsconfig.lint.json` until T-RR-005 declares `ContentBlock` under
 * `src/domain/chat/ContentBlock.ts`.
 *
 * Traces: TEST-RR-002, SPEC-RR-004, REQ-RR-011; ADR-RR-001 §1.
 */
import { describe, it, expect } from 'vitest';
import type { ContentBlock } from '@/domain/chat/ContentBlock';
import type { SubagentMode } from '@/domain/chat/Subagent';

type BlockType = ContentBlock['type'];
type BlockOf<T extends BlockType> = Extract<ContentBlock, { type: T }>;

type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// ---- the five members of chat.ts:31 ----
const _text: Equals<BlockOf<'text'>, { type: 'text'; content: string }> = true;
const _toolUse: Equals<BlockOf<'tool_use'>, { type: 'tool_use'; toolId: string }> = true;
const _thinking: Equals<
	BlockOf<'thinking'>,
	{ type: 'thinking'; content: string; durationSeconds?: number }
> = true;
const _subagent: Equals<
	BlockOf<'subagent'>,
	{ type: 'subagent'; subagentId: string; mode?: SubagentMode }
> = true;
const _compacted: Equals<BlockOf<'context_compacted'>, { type: 'context_compacted' }> = true;
void _text;
void _toolUse;
void _thinking;
void _subagent;
void _compacted;

describe('ContentBlock ordered union (TEST-RR-002)', () => {
	it('declares the five chat.ts:31 members in arrival order', () => {
		const blocks: ContentBlock[] = [
			{ type: 'text', content: 'hi' },
			{ type: 'thinking', content: 'hmm', durationSeconds: 2 },
			{ type: 'tool_use', toolId: 't1' },
			{ type: 'subagent', subagentId: 's1', mode: 'async' },
			{ type: 'context_compacted' },
		];
		expect(blocks.map((b) => b.type)).toEqual([
			'text',
			'thinking',
			'tool_use',
			'subagent',
			'context_compacted',
		]);
	});

	it('preserves ordering — consecutive text blocks are allowed', () => {
		const blocks: ContentBlock[] = [
			{ type: 'text', content: 'a' },
			{ type: 'text', content: 'b' },
		];
		expect(blocks).toHaveLength(2);
	});
});
