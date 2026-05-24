/**
 * T-RR-002 (TEST-RR-002) — RED: `ToolCall` matches the P2 subset of
 * claudian-main `ToolCallInfo` (`tools.ts:32`). The UI/P7 fields `isExpanded`
 * and `resolvedAnswers` are EXCLUDED (ADR-RR-001 §1).
 *
 * Fails `npx vue-tsc --noEmit -p tsconfig.lint.json` until T-RR-005 declares
 * `ToolCall` under `src/domain/chat/ToolCall.ts`.
 *
 * Traces: TEST-RR-002, SPEC-RR-005, REQ-RR-002, REQ-RR-003, REQ-RR-010; ADR-RR-001 §1.
 */
import { describe, it, expect } from 'vitest';
import type { ToolCall } from '@/domain/chat/ToolCall';
import type { ToolDiffData } from '@/domain/chat/diff/Diff';
import type { SubagentInfo } from '@/domain/chat/Subagent';

type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// ---- exact P2-subset shape ----
const _toolCall: Equals<
	ToolCall,
	{
		id: string;
		name: string;
		input: Record<string, unknown>;
		status: 'running' | 'completed' | 'error' | 'blocked';
		result?: string;
		diffData?: ToolDiffData;
		subagent?: SubagentInfo;
	}
> = true;
void _toolCall;

// ---- the excluded P7/UI members must NOT be on the type (their key access is `never`/absent) ----
type HasKey<T, K extends PropertyKey> = K extends keyof T ? true : false;
const _noIsExpanded: Equals<HasKey<ToolCall, 'isExpanded'>, false> = true;
const _noResolvedAnswers: Equals<HasKey<ToolCall, 'resolvedAnswers'>, false> = true;
void _noIsExpanded;
void _noResolvedAnswers;

describe('ToolCall P2 subset (TEST-RR-002)', () => {
	it('declares id/name/input/status + optional result/diffData/subagent', () => {
		const call: ToolCall = {
			id: 't1',
			name: 'Write',
			input: { file_path: 'a.ts', content: 'x' },
			status: 'running',
		};
		expect(call.status).toBe('running');
	});

	it('status moves through the four claudian states', () => {
		const states: ToolCall['status'][] = ['running', 'completed', 'error', 'blocked'];
		expect(states).toHaveLength(4);
	});
});
