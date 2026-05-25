import { describe, it, expect } from 'vitest';
import { chooseForkTarget, type ForkTarget } from '@/application/threads/chooseForkTarget';

/**
 * TEST-TS-014 (chooseForkTarget U leg) — the pure mapping that resolves the
 * fork-target modal's selected option to a `ForkTarget = 'new-tab' | 'current-tab'`
 * (SPEC-TS-013/023, REQ-TS-017). Pure/total — an unrecognised option → null
 * (defensive); never throws. The Obsidian modal (coverage-excluded) is a thin
 * shell over this mapping (its visual proof is TEST-TS-M2).
 */
describe('TEST-TS-014 chooseForkTarget', () => {
	it("maps 'new-tab' to the new-tab target", () => {
		expect(chooseForkTarget('new-tab')).toBe<ForkTarget>('new-tab');
	});

	it("maps 'current-tab' to the current-tab target", () => {
		expect(chooseForkTarget('current-tab')).toBe<ForkTarget>('current-tab');
	});

	it('returns null for an unrecognised / dismissed option', () => {
		expect(chooseForkTarget(null)).toBeNull();
		expect(chooseForkTarget('')).toBeNull();
		expect(chooseForkTarget('nope')).toBeNull();
	});

	it('never throws', () => {
		expect(() => chooseForkTarget(null)).not.toThrow();
	});
});
