/**
 * T-TS-002 (TEST-TS-003) + T-CP-005 (TEST-CP-002) — RED: `ChatRuntimePort` carries
 * the nine P1 members + the three P3 additive members (`resumeSession` /
 * `setResumeCheckpoint` / `getCapabilities`), and P4 APPENDS EXACTLY the three
 * inline-block callback setters (`setAskUserQuestionCallback` /
 * `setExitPlanModeCallback` / `setApprovalCallback`); `RuntimeCapabilities` is
 * `{supportsFork,supportsRewind}` + the P4 additive `{supportsPlanMode,
 * supportsInlineResponse}`. The 12 prior members + 3 prior caps stay
 * byte-identical (additivity, SPEC-CP-034).
 *
 * The compile-time exact-key equality (now FIFTEEN members + FIVE caps) fails
 * `vue-tsc -p tsconfig.lint.json` until T-CP-006 grows the port additively.
 *
 * Traces: TEST-TS-003, TEST-CP-002, SPEC-TS-003, SPEC-CP-002, SPEC-CP-034,
 * REQ-TS-013/019/021/028, REQ-CP-020/023/025/026/028; ADR-TS-002 §3, ADR-CP-004 §1.
 */
import { describe, it, expect } from 'vitest';
import type { ChatRuntimePort, RuntimeCapabilities } from '@/domain/ports/ChatRuntimePort';
import type { ChatRuntimeQueryOptions } from '@/domain/chat/ChatTurn';
import type {
	AskUserQuestionRequest,
	AskUserQuestionAnswer,
	ExitPlanModeRequest,
	ExitPlanModeDecision,
	ApprovalRequest,
	ApprovalDecision,
} from '@/domain/chat/inline';

type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type HasKey<T, K extends PropertyKey> = K extends keyof T ? true : false;

// Exact-key equality: nine P1 + three P3 + three P4 additive members = FIFTEEN.
type ExpectedKeys =
	// nine P1 members (SPEC-CC-001) — byte-identical
	| 'providerId'
	| 'prepareTurn'
	| 'ensureReady'
	| 'query'
	| 'cancel'
	| 'getSessionId'
	| 'resetSession'
	| 'onReadyStateChange'
	| 'isReady'
	// three P3 additive members (SPEC-TS-003) — byte-identical
	| 'resumeSession'
	| 'setResumeCheckpoint'
	| 'getCapabilities'
	// three P4 additive callback setters (SPEC-CP-002, ADR-CP-004 §1)
	| 'setAskUserQuestionCallback'
	| 'setExitPlanModeCallback'
	| 'setApprovalCallback';

const _exactFifteen: Equals<keyof ChatRuntimePort, ExpectedKeys> = true;
void _exactFifteen;

// The three P4 setters are `void` setters taking a `(req) => Promise<decision|null>` callback.
const _askSetter: Equals<
	ChatRuntimePort['setAskUserQuestionCallback'],
	(cb: (req: AskUserQuestionRequest) => Promise<AskUserQuestionAnswer | null>) => void
> = true;
const _exitSetter: Equals<
	ChatRuntimePort['setExitPlanModeCallback'],
	(cb: (req: ExitPlanModeRequest) => Promise<ExitPlanModeDecision | null>) => void
> = true;
const _approvalSetter: Equals<
	ChatRuntimePort['setApprovalCallback'],
	(cb: (req: ApprovalRequest) => Promise<ApprovalDecision | null>) => void
> = true;
void _askSetter;
void _exitSetter;
void _approvalSetter;

// The three additive members carry their exact signatures (non-streaming, non-Result).
const _resumeSession: Equals<ChatRuntimePort['resumeSession'], (sessionId: string) => void> = true;
const _setResumeCheckpoint: Equals<
	ChatRuntimePort['setResumeCheckpoint'],
	(assistantMessageId: string) => void
> = true;
const _getCapabilities: Equals<
	ChatRuntimePort['getCapabilities'],
	() => RuntimeCapabilities
> = true;
void _resumeSession;
void _setResumeCheckpoint;
void _getCapabilities;

// RuntimeCapabilities is { supportsFork, supportsRewind } + the P4 additive
// { supportsPlanMode, supportsInlineResponse } (SPEC-CP-002, SPEC-CP-034).
const _capsFork: Equals<RuntimeCapabilities['supportsFork'], boolean> = true;
const _capsRewind: Equals<RuntimeCapabilities['supportsRewind'], boolean> = true;
const _capsPlan: Equals<RuntimeCapabilities['supportsPlanMode'], boolean> = true;
const _capsInline: Equals<RuntimeCapabilities['supportsInlineResponse'], boolean> = true;
type CapsExpectedKeys =
	| 'supportsFork'
	| 'supportsRewind'
	| 'supportsPlanMode'
	| 'supportsInlineResponse';
const _capsExact: Equals<keyof RuntimeCapabilities, CapsExpectedKeys> = true;
void _capsFork;
void _capsRewind;
void _capsPlan;
void _capsInline;
void _capsExact;

// The still-deferred members stay absent (the keyof exact equality already
// guarantees this; the explicit asserts document intent). The approval setter
// is now PRESENT (P4) so it is no longer asserted absent.
const _noRewind: Equals<HasKey<ChatRuntimePort, 'rewind'>, false> = true;
const _noSteer: Equals<HasKey<ChatRuntimePort, 'steer'>, false> = true;
const _hasApprovalSetter: Equals<HasKey<ChatRuntimePort, 'setApprovalCallback'>, true> = true;
void _noRewind;
void _noSteer;
void _hasApprovalSetter;

// ChatRuntimeQueryOptions gains optional forceColdStart?: boolean (model? intact).
const _forceColdStart: Equals<
	ChatRuntimeQueryOptions['forceColdStart'],
	boolean | undefined
> = true;
const _model: Equals<ChatRuntimeQueryOptions['model'], string | undefined> = true;
void _forceColdStart;
void _model;

describe('ChatRuntimePort additive growth (TEST-TS-003 + TEST-CP-002)', () => {
	it('lists exactly the nine P1 + three P3 + three P4 members (runtime sentinel)', () => {
		const p1 = [
			'providerId',
			'prepareTurn',
			'ensureReady',
			'query',
			'cancel',
			'getSessionId',
			'resetSession',
			'onReadyStateChange',
			'isReady',
		];
		const p3 = ['resumeSession', 'setResumeCheckpoint', 'getCapabilities'];
		const p4 = ['setAskUserQuestionCallback', 'setExitPlanModeCallback', 'setApprovalCallback'];
		expect(p1).toHaveLength(9);
		expect(p3).toHaveLength(3);
		expect(p4).toHaveLength(3);
		expect([...p1, ...p3, ...p4]).toHaveLength(15);
		expect([...p3, ...p4]).not.toContain('rewind');
		expect([...p3, ...p4]).not.toContain('steer');
	});
});
