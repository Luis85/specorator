/**
 * T-TS-002 (TEST-TS-003) — RED: `ChatRuntimePort` gains EXACTLY
 * `resumeSession` / `setResumeCheckpoint` / `getCapabilities` + `RuntimeCapabilities`
 * `{supportsFork,supportsRewind}`, with the nine P1 members byte-identical, and
 * `ChatRuntimeQueryOptions` gaining optional `forceColdStart?: boolean`.
 *
 * The compile-time exact-key equality (now TWELVE members) + the
 * `RuntimeCapabilities`/`forceColdStart` asserts fail
 * `vue-tsc -p tsconfig.lint.json` until T-TS-005 grows the port additively.
 *
 * Traces: TEST-TS-003, SPEC-TS-003, REQ-TS-013/019/021/028; ADR-TS-002 §3.
 */
import { describe, it, expect } from 'vitest';
import type { ChatRuntimePort, RuntimeCapabilities } from '@/domain/ports/ChatRuntimePort';
import type { ChatRuntimeQueryOptions } from '@/domain/chat/ChatTurn';

type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type HasKey<T, K extends PropertyKey> = K extends keyof T ? true : false;

// Exact-key equality: the nine P1 members + the three P3 additive members = TWELVE.
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
	// three P3 additive members (SPEC-TS-003)
	| 'resumeSession'
	| 'setResumeCheckpoint'
	| 'getCapabilities';

const _exactTwelve: Equals<keyof ChatRuntimePort, ExpectedKeys> = true;
void _exactTwelve;

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

// RuntimeCapabilities is exactly { supportsFork, supportsRewind }.
const _capsFork: Equals<RuntimeCapabilities['supportsFork'], boolean> = true;
const _capsRewind: Equals<RuntimeCapabilities['supportsRewind'], boolean> = true;
type CapsExpectedKeys = 'supportsFork' | 'supportsRewind';
const _capsExact: Equals<keyof RuntimeCapabilities, CapsExpectedKeys> = true;
void _capsFork;
void _capsRewind;
void _capsExact;

// The still-deferred members stay absent (the keyof exact equality already
// guarantees this; the explicit asserts document intent).
const _noRewind: Equals<HasKey<ChatRuntimePort, 'rewind'>, false> = true;
const _noSteer: Equals<HasKey<ChatRuntimePort, 'steer'>, false> = true;
const _noApprovalSetter: Equals<HasKey<ChatRuntimePort, 'setApprovalCallback'>, false> = true;
void _noRewind;
void _noSteer;
void _noApprovalSetter;

// ChatRuntimeQueryOptions gains optional forceColdStart?: boolean (model? intact).
const _forceColdStart: Equals<
	ChatRuntimeQueryOptions['forceColdStart'],
	boolean | undefined
> = true;
const _model: Equals<ChatRuntimeQueryOptions['model'], string | undefined> = true;
void _forceColdStart;
void _model;

describe('ChatRuntimePort additive growth (TEST-TS-003)', () => {
	it('lists exactly the nine P1 + three P3 members (runtime sentinel)', () => {
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
		expect(p1).toHaveLength(9);
		expect(p3).toHaveLength(3);
		expect([...p1, ...p3]).toHaveLength(12);
		expect(p3).not.toContain('rewind');
		expect(p3).not.toContain('steer');
	});
});
