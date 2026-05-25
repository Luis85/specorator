/**
 * T-CP-002 (TEST-CP-004) — RED: the inline-block DTOs match SPEC-CP-004 shapes.
 *
 * Asserts (compile-time + runtime sentinel): every `id`/`requestId` is a
 * non-empty string field; `AskUserQuestionAnswer.answers` is keyed by question id
 * with `string | {custom}` values; `ExitPlanModeDecision` is the three-kind union
 * with `revise` carrying `feedback`; `ApprovalDecision` is exactly
 * `'deny'|'allow'|'allow-always'` and `'allow-always'` carries NO persistence
 * field; all re-exported from `@/domain/chat/inline/index`.
 *
 * Fails `vue-tsc -p tsconfig.lint.json` until T-CP-003 creates the DTOs.
 *
 * Traces: TEST-CP-004, SPEC-CP-004, REQ-CP-022/024/026, NFR-CP-009.
 */
import { describe, it, expect } from 'vitest';
import type {
	AskUserQuestionOption,
	AskUserQuestionItem,
	AskUserQuestionRequest,
	AskUserQuestionAnswer,
	ExitPlanModeRequest,
	ExitPlanModeDecision,
	ApprovalDecision,
	ApprovalOption,
	ApprovalRequest,
} from '@/domain/chat/inline';

type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type HasKey<T, K extends PropertyKey> = K extends keyof T ? true : false;

// ---- AskUserQuestion shapes ----
const _optionShape: Equals<
	AskUserQuestionOption,
	{ readonly id: string; readonly label: string; readonly description?: string }
> = true;
const _itemShape: Equals<
	AskUserQuestionItem,
	{
		readonly id: string;
		readonly question: string;
		readonly options: AskUserQuestionOption[];
		readonly allowCustomInput?: boolean;
	}
> = true;
const _requestShape: Equals<
	AskUserQuestionRequest,
	{ readonly requestId: string; readonly questions: AskUserQuestionItem[] }
> = true;
const _answerShape: Equals<
	AskUserQuestionAnswer,
	{ readonly requestId: string; readonly answers: Record<string, string | { custom: string }> }
> = true;
void _optionShape;
void _itemShape;
void _requestShape;
void _answerShape;

// ---- ExitPlanMode shapes ----
const _exitRequestShape: Equals<
	ExitPlanModeRequest,
	{
		readonly requestId: string;
		readonly plan: string;
		readonly allowedPrompts?: { tool: string; prompt: string }[];
	}
> = true;
const _exitDecisionShape: Equals<
	ExitPlanModeDecision,
	{ kind: 'implement' } | { kind: 'revise'; feedback: string } | { kind: 'cancel' }
> = true;
void _exitRequestShape;
void _exitDecisionShape;

// ---- Approval shapes ----
const _approvalDecisionShape: Equals<
	ApprovalDecision,
	'deny' | 'allow' | 'allow-always'
> = true;
const _approvalOptionShape: Equals<
	ApprovalOption,
	{ readonly decision: ApprovalDecision; readonly label: string }
> = true;
const _approvalRequestShape: Equals<
	ApprovalRequest,
	{
		readonly requestId: string;
		readonly tool: string;
		readonly context: string;
		readonly options: ApprovalOption[];
	}
> = true;
void _approvalDecisionShape;
void _approvalOptionShape;
void _approvalRequestShape;

// `allow-always` carries NO persistence field — the union is a bare string literal.
const _allowAlwaysIsString: Equals<Extract<ApprovalDecision, 'allow-always'>, 'allow-always'> = true;
void _allowAlwaysIsString;

// `ApprovalOption` has exactly two keys (no `persist`/`rule`/`scope`).
const _approvalOptionNoPersist: Equals<HasKey<ApprovalOption, 'persist'>, false> = true;
const _approvalOptionExactKeys: Equals<keyof ApprovalOption, 'decision' | 'label'> = true;
void _approvalOptionNoPersist;
void _approvalOptionExactKeys;

describe('inline-block DTOs (TEST-CP-004)', () => {
	it('AskUserQuestionAnswer keys answers by question id with string | {custom}', () => {
		const answer: AskUserQuestionAnswer = {
			requestId: 'req-1',
			answers: { q1: 'opt-a', q2: { custom: 'free text' } },
		};
		expect(answer.answers.q1).toBe('opt-a');
		expect(answer.answers.q2).toEqual({ custom: 'free text' });
	});

	it('ExitPlanModeDecision revise carries feedback', () => {
		const revise: ExitPlanModeDecision = { kind: 'revise', feedback: 'tighten step 2' };
		const implement: ExitPlanModeDecision = { kind: 'implement' };
		const cancel: ExitPlanModeDecision = { kind: 'cancel' };
		expect(revise.kind).toBe('revise');
		expect(revise.feedback).toBe('tighten step 2');
		expect([implement.kind, cancel.kind]).toEqual(['implement', 'cancel']);
	});

	it('ApprovalDecision is exactly deny|allow|allow-always; allow-always persists no rule', () => {
		const decisions: ApprovalDecision[] = ['deny', 'allow', 'allow-always'];
		expect(decisions).toEqual(['deny', 'allow', 'allow-always']);
		const option: ApprovalOption = { decision: 'allow-always', label: 'Always allow' };
		// Exactly two keys — no persistence field on the option (NG3, REQ-CP-026).
		expect(Object.keys(option).sort()).toEqual(['decision', 'label']);
	});

	it('every id/requestId is a string field', () => {
		const req: AskUserQuestionRequest = {
			requestId: 'r',
			questions: [{ id: 'q1', question: 'pick', options: [{ id: 'o1', label: 'A' }] }],
		};
		const exit: ExitPlanModeRequest = { requestId: 'r2', plan: 'do the thing' };
		const approval: ApprovalRequest = {
			requestId: 'r3',
			tool: 'Bash',
			context: 'run npm test',
			options: [{ decision: 'allow', label: 'Allow once' }],
		};
		expect(req.questions[0]?.id).toBe('q1');
		expect(exit.plan).toBe('do the thing');
		expect(approval.tool).toBe('Bash');
	});
});
