/**
 * T-TS-002 (TEST-TS-003) + T-CP-005 (TEST-CP-002) + T-TC-007 (TEST-TC-003/019/021/
 * 027) — RED: `ChatRuntimePort` carries the nine P1 members + the three P3 additive
 * members (`resumeSession` / `setResumeCheckpoint` / `getCapabilities`) + the three
 * P4 inline-block callback setters (`setAskUserQuestionCallback` /
 * `setExitPlanModeCallback` / `setApprovalCallback`), and P6 APPENDS EXACTLY
 * `getToolbarCapabilities(): ToolbarCapabilities`. `RuntimeCapabilities` is
 * `{supportsFork,supportsRewind}` + the P4 additive `{supportsPlanMode,
 * supportsInlineResponse}` (byte-identical). `ToolbarCapabilities` is the five
 * P6 `readonly` flags. The 15 prior members + 4 prior caps stay byte-identical
 * (additivity, SPEC-CP-034 / SPEC-TC-027, NFR-TC-001 / NFR-AS-001).
 *
 * P7 (T-AS-010, TEST-AS-001 capabilities-shape leg + TEST-AS-021 additivity leg,
 * SPEC-AS-006b) WIDENS `ToolbarCapabilities.permissionMode` from the P6
 * `'default' | 'plan'` to the live `PermissionMode` (`'normal' | 'plan' | 'yolo'`),
 * the P6 `'default'` value mapping to `'normal'`. The four OTHER `ToolbarCapabilities`
 * flags + the five `RuntimeCapabilities` flags + the P0–P6 `ChatRuntimePort` members
 * stay byte-identical. This leg fails `vue-tsc -p tsconfig.lint.json` until T-AS-011
 * widens the union.
 *
 * Traces: TEST-TS-003, TEST-CP-002, TEST-TC-003/019/021/027, TEST-AS-001/021,
 * SPEC-TS-003, SPEC-CP-002, SPEC-CP-034, SPEC-TC-005/027, SPEC-AS-006/021,
 * REQ-TS-013/019/021/028, REQ-CP-020/023/025/026/028, REQ-TC-003/015/019/021,
 * REQ-AS-003; ADR-TS-002 §3, ADR-CP-004 §1, ADR-TC-003 §2, ADR-AS-002 §2;
 * NFR-TC-001, NFR-AS-001.
 */
import { describe, it, expect } from 'vitest';
import type {
	ChatRuntimePort,
	RuntimeCapabilities,
	ToolbarCapabilities,
} from '@/domain/ports/ChatRuntimePort';
// `ToolbarCapabilities` is also surfaced through the ports barrel (SPEC-TC-005).
import type { ToolbarCapabilities as ToolbarCapsFromBarrel } from '@/domain/ports';
import type { ChatRuntimeQueryOptions } from '@/domain/chat/ChatTurn';
import type { PermissionMode } from '@/domain/chat/PermissionMode';
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

// Exact-key equality: nine P1 + three P3 + three P4 + one P6 member = SIXTEEN.
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
	// three P4 additive callback setters (SPEC-CP-002, ADR-CP-004 §1) — byte-identical
	| 'setAskUserQuestionCallback'
	| 'setExitPlanModeCallback'
	| 'setApprovalCallback'
	// one P6 additive member (SPEC-TC-005, ADR-TC-003 §2)
	| 'getToolbarCapabilities';

const _exactSixteen: Equals<keyof ChatRuntimePort, ExpectedKeys> = true;
void _exactSixteen;

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

// ---- T-TC-007: getToolbarCapabilities() is synchronous + total (SPEC-TC-005) ----
const _getToolbarCapabilities: Equals<
	ChatRuntimePort['getToolbarCapabilities'],
	() => ToolbarCapabilities
> = true;
void _getToolbarCapabilities;

// ToolbarCapabilities is EXACTLY the five P6 readonly flags, surfaced through the
// barrel as the same type (SPEC-TC-005).
const _toolbarCapsKeys: Equals<
	keyof ToolbarCapabilities,
	'supportsMcpTools' | 'reasoningControl' | 'hasServiceTier' | 'hasModeToggle' | 'permissionMode'
> = true;
const _toolbarMcp: Equals<ToolbarCapabilities['supportsMcpTools'], boolean> = true;
const _toolbarReasoning: Equals<
	ToolbarCapabilities['reasoningControl'],
	'effort' | 'token-budget' | 'none'
> = true;
const _toolbarTier: Equals<ToolbarCapabilities['hasServiceTier'], boolean> = true;
const _toolbarMode: Equals<ToolbarCapabilities['hasModeToggle'], boolean> = true;
// P7 (TEST-AS-001 capabilities-shape leg, SPEC-AS-006b): WIDENED to PermissionMode.
const _toolbarPermission: Equals<ToolbarCapabilities['permissionMode'], PermissionMode> = true;
const _toolbarPermissionWidened: Equals<
	ToolbarCapabilities['permissionMode'],
	'normal' | 'plan' | 'yolo'
> = true;
const _toolbarBarrelSame: Equals<ToolbarCapabilities, ToolbarCapsFromBarrel> = true;
void _toolbarCapsKeys;
void _toolbarMcp;
void _toolbarReasoning;
void _toolbarTier;
void _toolbarMode;
void _toolbarPermission;
void _toolbarPermissionWidened;
void _toolbarBarrelSame;

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

describe('ChatRuntimePort additive growth (TEST-TS-003 + TEST-CP-002 + TEST-TC-027)', () => {
	it('lists exactly the nine P1 + three P3 + three P4 + one P6 member (runtime sentinel)', () => {
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
		const p6 = ['getToolbarCapabilities'];
		expect(p1).toHaveLength(9);
		expect(p3).toHaveLength(3);
		expect(p4).toHaveLength(3);
		expect(p6).toHaveLength(1);
		expect([...p1, ...p3, ...p4, ...p6]).toHaveLength(16);
		expect([...p3, ...p4, ...p6]).not.toContain('rewind');
		expect([...p3, ...p4, ...p6]).not.toContain('steer');
	});

	it('reports the five-flag ToolbarCapabilities synchronously (TEST-TC-003/019/021, TEST-AS-001)', () => {
		// P7: the P6 `'default'` display value maps to the live `'normal'` (SPEC-AS-006b).
		const caps: ToolbarCapabilities = {
			supportsMcpTools: false,
			reasoningControl: 'effort',
			hasServiceTier: false,
			hasModeToggle: true,
			permissionMode: 'normal',
		};
		expect(caps.reasoningControl).toBe('effort');
		expect(caps.permissionMode).toBe('normal');
		expect(Object.keys(caps)).toEqual([
			'supportsMcpTools',
			'reasoningControl',
			'hasServiceTier',
			'hasModeToggle',
			'permissionMode',
		]);
	});

	it('represents all three live permission modes (TEST-AS-001 widen leg)', () => {
		const modes: PermissionMode[] = ['normal', 'plan', 'yolo'];
		for (const mode of modes) {
			const caps: ToolbarCapabilities = {
				supportsMcpTools: false,
				reasoningControl: 'none',
				hasServiceTier: false,
				hasModeToggle: true,
				permissionMode: mode,
			};
			expect(caps.permissionMode).toBe(mode);
		}
	});
});
