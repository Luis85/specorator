/**
 * T-CC-002 (TEST-CC-003) — the P1 `ChatRuntimePort` member sentinel, superseded
 * additively by P3 (SPEC-TS-003, T-TS-005). The nine P1 members stay
 * byte-identical (REQ-TS-028); P3 appended exactly three members
 * (`resumeSession`/`setResumeCheckpoint`/`getCapabilities`) — so this file now
 * asserts the nine P1 members are PRESENT (not that they are the only members).
 * The exact-twelve contract lives in `ChatRuntimePort.ts.test.ts` (TEST-TS-003).
 *
 * SPEC-CC-001 / ADR-CC-001 bless the streaming + lifecycle subset of Claudian's
 * `ChatRuntime` (`ChatRuntime.ts:20`); the still-deferred members
 * (callback-setters / `rewind` / `steer` / subagent) remain absent.
 *
 * Traces: TEST-CC-003, SPEC-CC-001, REQ-CC-002a, SPEC-TS-003, REQ-TS-028;
 * ADR-CC-001 (Decision §3, Compliance), ADR-TS-002 §3.
 */
import { describe, it, expect } from 'vitest';
import type { ChatRuntimePort } from '@/domain/ports/ChatRuntimePort';

type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type HasKey<T, K extends PropertyKey> = K extends keyof T ? true : false;

// The nine P1 members stay present + byte-identical (REQ-TS-028). P3 grows the
// port additively, so we assert PRESENCE (not exact count) here.
const _providerId: Equals<HasKey<ChatRuntimePort, 'providerId'>, true> = true;
const _prepareTurn: Equals<HasKey<ChatRuntimePort, 'prepareTurn'>, true> = true;
const _ensureReady: Equals<HasKey<ChatRuntimePort, 'ensureReady'>, true> = true;
const _query: Equals<HasKey<ChatRuntimePort, 'query'>, true> = true;
const _cancel: Equals<HasKey<ChatRuntimePort, 'cancel'>, true> = true;
const _getSessionId: Equals<HasKey<ChatRuntimePort, 'getSessionId'>, true> = true;
const _resetSession: Equals<HasKey<ChatRuntimePort, 'resetSession'>, true> = true;
const _onReadyStateChange: Equals<HasKey<ChatRuntimePort, 'onReadyStateChange'>, true> = true;
const _isReady: Equals<HasKey<ChatRuntimePort, 'isReady'>, true> = true;
void _providerId;
void _prepareTurn;
void _ensureReady;
void _query;
void _cancel;
void _getSessionId;
void _resetSession;
void _onReadyStateChange;
void _isReady;

// P4 (SPEC-CP-002) appended the inline-block callback setters, so
// `setApprovalCallback` is now PRESENT; the exact-fifteen contract lives in
// `ChatRuntimePort.ts.test.ts`. The still-deferred `rewind`/`steer` stay absent.
const _hasApprovalSetter: Equals<HasKey<ChatRuntimePort, 'setApprovalCallback'>, true> = true;
const _noRewind: Equals<HasKey<ChatRuntimePort, 'rewind'>, false> = true;
const _noSteer: Equals<HasKey<ChatRuntimePort, 'steer'>, false> = true;
void _hasApprovalSetter;
void _noRewind;
void _noSteer;

describe('ChatRuntimePort shape (TEST-CC-003)', () => {
	it('lists the nine blessed P1 members (runtime sentinel)', () => {
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
		expect(p1).toHaveLength(9);
		expect(p1).not.toContain('setApprovalCallback');
		expect(p1).not.toContain('rewind');
		expect(p1).not.toContain('steer');
	});
});
