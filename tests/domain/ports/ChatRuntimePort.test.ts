/**
 * T-CC-002 (TEST-CC-003) — RED: `ChatRuntimePort` declares exactly nine members.
 *
 * SPEC-CC-001 / ADR-CC-001 bless the streaming + lifecycle subset of Claudian's
 * `ChatRuntime` (`ChatRuntime.ts:20`): `providerId`, `prepareTurn`, `ensureReady`,
 * `query`, `cancel`, `getSessionId`, `resetSession`, `onReadyStateChange`,
 * `isReady` — and NO callback-setter / `rewind` / `steer` / subagent member in P1.
 * The compile-time exact-key equality below fails `npm run typecheck`
 * (`tsconfig.lint.json` covers `tests/**`) until T-CC-004 declares the port.
 *
 * Traces: TEST-CC-003, SPEC-CC-001, REQ-CC-002a; ADR-CC-001 (Decision §3, Compliance).
 */
import { describe, it, expect } from 'vitest';
import type { ChatRuntimePort } from '@/domain/ports/ChatRuntimePort';

type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// Exact-key equality: true ONLY when ChatRuntimePort exposes EXACTLY these nine keys.
type ExpectedKeys =
	| 'providerId'
	| 'prepareTurn'
	| 'ensureReady'
	| 'query'
	| 'cancel'
	| 'getSessionId'
	| 'resetSession'
	| 'onReadyStateChange'
	| 'isReady';

const _portHasExactlyNineMembers: Equals<keyof ChatRuntimePort, ExpectedKeys> = true;
void _portHasExactlyNineMembers;

// Deferred members must NOT be present in P1 (their absence keeps the keyof exact).
const _noApprovalSetter: Equals<
	Extract<keyof ChatRuntimePort, 'setApprovalCallback'>,
	never
> = true;
const _noRewind: Equals<Extract<keyof ChatRuntimePort, 'rewind'>, never> = true;
const _noSteer: Equals<Extract<keyof ChatRuntimePort, 'steer'>, never> = true;
void _noApprovalSetter;
void _noRewind;
void _noSteer;

describe('ChatRuntimePort shape (TEST-CC-003)', () => {
	it('lists exactly the nine blessed members (runtime sentinel)', () => {
		const expected = [
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
		expect(expected).toHaveLength(9);
		expect(expected).not.toContain('setApprovalCallback');
		expect(expected).not.toContain('rewind');
		expect(expected).not.toContain('steer');
	});
});
