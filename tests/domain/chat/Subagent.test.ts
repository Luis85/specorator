/**
 * T-RR-002 (TEST-RR-002) — RED: `SubagentInfo` / `SubagentMode` /
 * `AsyncSubagentStatus` match the P2 subset of claudian-main `tools.ts:55/58/66`.
 * `isExpanded` (UI-layer state) is EXCLUDED (ADR-RR-001 §1).
 *
 * Fails `npx vue-tsc --noEmit -p tsconfig.lint.json` until T-RR-005 declares
 * these under `src/domain/chat/Subagent.ts`.
 *
 * Traces: TEST-RR-002, SPEC-RR-006, REQ-RR-006, REQ-RR-021, REQ-RR-021a; ADR-RR-001 §1.
 */
import { describe, it, expect } from 'vitest';
import type { SubagentInfo, SubagentMode, AsyncSubagentStatus } from '@/domain/chat/Subagent';
import type { ToolCall } from '@/domain/chat/ToolCall';

type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const _mode: Equals<SubagentMode, 'sync' | 'async'> = true;
const _asyncStatus: Equals<
	AsyncSubagentStatus,
	'pending' | 'running' | 'completed' | 'error' | 'orphaned'
> = true;
void _mode;
void _asyncStatus;

const _subagent: Equals<
	SubagentInfo,
	{
		id: string;
		description: string;
		prompt?: string;
		mode?: SubagentMode;
		result?: string;
		status: 'running' | 'completed' | 'error';
		toolCalls: ToolCall[];
		asyncStatus?: AsyncSubagentStatus;
		agentId?: string;
		outputToolId?: string;
		startedAt?: number;
		completedAt?: number;
	}
> = true;
void _subagent;

// ---- isExpanded EXCLUDED (P2 subset) ----
type HasKey<T, K extends PropertyKey> = K extends keyof T ? true : false;
const _noIsExpanded: Equals<HasKey<SubagentInfo, 'isExpanded'>, false> = true;
void _noIsExpanded;

describe('Subagent domain types (TEST-RR-002)', () => {
	it('SubagentMode is sync|async', () => {
		const modes: SubagentMode[] = ['sync', 'async'];
		expect(modes).toEqual(['sync', 'async']);
	});

	it('AsyncSubagentStatus ladders pending→orphaned', () => {
		const ladder: AsyncSubagentStatus[] = [
			'pending',
			'running',
			'completed',
			'error',
			'orphaned',
		];
		expect(ladder).toHaveLength(5);
	});

	it('SubagentInfo nests ToolCall[] and correlates async by agentId', () => {
		const sub: SubagentInfo = {
			id: 's1',
			description: 'research',
			status: 'running',
			toolCalls: [],
			mode: 'async',
			asyncStatus: 'pending',
			agentId: 'agent-1',
		};
		expect(sub.toolCalls).toEqual([]);
	});
});
