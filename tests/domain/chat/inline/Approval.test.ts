/**
 * T-AS-002 (TEST-AS-016 union leg) — RED: the P4 `ApprovalDecision` union grows
 * additively by the fourth member `'deny-always'` — EXACTLY
 * `'deny' | 'allow' | 'allow-always' | 'deny-always'`. The three P4 members stay
 * byte-identical, and the `ApprovalRequest` / `ApprovalOption` shapes are
 * unchanged (the block renders ONE additional option row entry, NG4).
 *
 * Fails `vue-tsc -p tsconfig.lint.json` until T-AS-003 grows the union in
 * `@/domain/chat/inline/Approval`.
 *
 * Traces: TEST-AS-016, SPEC-AS-003, SPEC-AS-021, REQ-AS-016, REQ-AS-021,
 * REQ-AS-030, NFR-AS-001.
 */
import { describe, it, expect } from 'vitest';
import type {
	ApprovalDecision,
	ApprovalOption,
	ApprovalRequest,
} from '@/domain/chat/inline/Approval';

type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// ---- ApprovalDecision is EXACTLY the four-member union (the P4 three + deny-always) ----
const _exact: Equals<
	ApprovalDecision,
	'deny' | 'allow' | 'allow-always' | 'deny-always'
> = true;
void _exact;

// The three P4 members stay assignable (byte-identical).
const _deny: ApprovalDecision = 'deny';
const _allow: ApprovalDecision = 'allow';
const _allowAlways: ApprovalDecision = 'allow-always';
// The P7 additive fourth member.
const _denyAlways: ApprovalDecision = 'deny-always';
void _deny;
void _allow;
void _allowAlways;
void _denyAlways;

// ---- ApprovalOption / ApprovalRequest shapes are UNCHANGED (additive union only) ----
const _optionKeys: Equals<keyof ApprovalOption, 'decision' | 'label'> = true;
const _optionDecision: Equals<ApprovalOption['decision'], ApprovalDecision> = true;
const _requestKeys: Equals<
	keyof ApprovalRequest,
	'requestId' | 'tool' | 'context' | 'options'
> = true;
void _optionKeys;
void _optionDecision;
void _requestKeys;

describe('ApprovalDecision grown by deny-always (TEST-AS-016)', () => {
	it('enumerates exactly the four members', () => {
		const decisions: ApprovalDecision[] = ['deny', 'allow', 'allow-always', 'deny-always'];
		expect(decisions).toEqual(['deny', 'allow', 'allow-always', 'deny-always']);
		expect(decisions).toHaveLength(4);
	});

	it('builds an ApprovalOption carrying the deny-always decision', () => {
		const option: ApprovalOption = { decision: 'deny-always', label: 'Always deny' };
		expect(option.decision).toBe('deny-always');
	});

	it('keeps the ApprovalRequest shape unchanged', () => {
		const request: ApprovalRequest = {
			requestId: 'r1',
			tool: 'Bash',
			context: 'Run command: git status',
			options: [{ decision: 'deny-always', label: 'Always deny' }],
		};
		expect(Object.keys(request)).toEqual(['requestId', 'tool', 'context', 'options']);
	});
});
