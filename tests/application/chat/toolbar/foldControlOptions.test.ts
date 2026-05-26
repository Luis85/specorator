/**
 * TEST-TC-002 (fold leg) + TEST-TC-004 (fold leg) — `foldControlOptions` pure
 * guarded fold.
 *
 * SPEC-TC-010: `foldControlOptions(controls)` -> `Partial<ChatRuntimeQueryOptions>`
 * writing a field ONLY when `controls` carries an explicit present/non-empty value:
 * `controls.model` -> `model` (present + non-empty); `controls.mode` -> `mode`
 * (present + non-empty); `controls.reasoning` -> `reasoning` (present); and
 * `controls.serviceTier` -> `serviceTier` (present + non-empty). A descriptor default
 * is NEVER folded (EC-TC-6). An untouched toolbar (`{}`) yields `{}` (EC-TC-1,
 * byte-identical to a P5 turn). The seam widgets (permission/MCP/external) contribute
 * nothing. Pure + total — never throws.
 *
 * Traces: TEST-TC-002 (fold leg), TEST-TC-004 (fold leg), SPEC-TC-010, REQ-TC-004,
 * NFR-TC-001, NFR-TC-005, EC-TC-1, EC-TC-6.
 */
import { describe, it, expect } from 'vitest';
import { foldControlOptions } from '@/application/chat/toolbar/foldControlOptions';
import type { TabControls } from '@/domain/chat/toolbar/TabControls';

describe('foldControlOptions (TEST-TC-002/004 fold legs)', () => {
	it('an untouched toolbar ({}) folds to {} (EC-TC-1, NFR-TC-001)', () => {
		expect(foldControlOptions({})).toEqual({});
	});

	it('folds a present model', () => {
		expect(foldControlOptions({ model: 'claude-sonnet-4' })).toEqual({ model: 'claude-sonnet-4' });
	});

	it('folds a present mode', () => {
		expect(foldControlOptions({ mode: 'concise' })).toEqual({ mode: 'concise' });
	});

	it('folds a present effort reasoning choice', () => {
		const controls: TabControls = { reasoning: { kind: 'effort', value: 'high' } };
		expect(foldControlOptions(controls)).toEqual({ reasoning: { kind: 'effort', value: 'high' } });
	});

	it('folds a present budget reasoning choice', () => {
		const controls: TabControls = { reasoning: { kind: 'budget', tokens: 4096 } };
		expect(foldControlOptions(controls)).toEqual({ reasoning: { kind: 'budget', tokens: 4096 } });
	});

	it('folds a present service tier', () => {
		expect(foldControlOptions({ serviceTier: 'priority' })).toEqual({ serviceTier: 'priority' });
	});

	it('folds every present field together', () => {
		const controls: TabControls = {
			model: 'claude-opus-4',
			mode: 'verbose',
			reasoning: { kind: 'effort', value: 'medium' },
			serviceTier: 'standard',
		};
		expect(foldControlOptions(controls)).toEqual({
			model: 'claude-opus-4',
			mode: 'verbose',
			reasoning: { kind: 'effort', value: 'medium' },
			serviceTier: 'standard',
		});
	});

	it('writes only the present fields, omitting absent ones', () => {
		const folded = foldControlOptions({ model: 'claude-haiku' });
		expect(folded).toEqual({ model: 'claude-haiku' });
		expect('mode' in folded).toBe(false);
		expect('reasoning' in folded).toBe(false);
		expect('serviceTier' in folded).toBe(false);
	});

	it('never folds an empty-string model / mode / serviceTier (treated as no explicit pick, EC-TC-6)', () => {
		expect(foldControlOptions({ model: '' })).toEqual({});
		expect(foldControlOptions({ mode: '' })).toEqual({});
		expect(foldControlOptions({ serviceTier: '' })).toEqual({});
	});

	it('does not introduce the P0–P5 query-option fields (additive only, NFR-TC-001)', () => {
		const folded = foldControlOptions({ model: 'claude-sonnet-4' });
		expect('forceColdStart' in folded).toBe(false);
		expect('appendSystemPrompt' in folded).toBe(false);
	});

	it('is total — never throws on any TabControls shape', () => {
		expect(() => foldControlOptions({})).not.toThrow();
		expect(() =>
			foldControlOptions({
				model: 'm',
				mode: 'x',
				reasoning: { kind: 'budget', tokens: 0 },
				serviceTier: 's',
			}),
		).not.toThrow();
	});
});

/**
 * TEST-AS-002 (fold leg) — the P7 guarded `permissionMode` clause.
 *
 * SPEC-AS-011: the added clause writes `folded.permissionMode = controls.permissionMode`
 * ONLY when present AND non-`'normal'`. So `{}` → `{}` and `{ permissionMode: 'normal' }`
 * → `{}` (both byte-identical to a P6 turn — the runtime applies its `normal` default,
 * EC-AS-2/13); `'plan'`/`'yolo'` are folded. The P6 `model`/`mode`/`reasoning`/`serviceTier`
 * clauses + behaviour stay byte-identical (SPEC-AS-021). Pure + total — never throws.
 *
 * Traces: TEST-AS-002 (fold leg), SPEC-AS-011, SPEC-AS-021, REQ-AS-002, REQ-AS-052,
 * NFR-AS-001, EC-AS-2, EC-AS-13.
 */
describe('foldControlOptions — the P7 permissionMode clause (TEST-AS-002 fold leg)', () => {
	it('folds nothing for an untouched toolbar ({}) — byte-identical P6 (EC-AS-2, NFR-AS-001)', () => {
		const folded = foldControlOptions({});
		expect(folded).toEqual({});
		expect('permissionMode' in folded).toBe(false);
	});

	it('does NOT fold an explicit permissionMode: \'normal\' (the non-normal-only guard, EC-AS-13)', () => {
		const folded = foldControlOptions({ permissionMode: 'normal' });
		expect(folded).toEqual({});
		expect('permissionMode' in folded).toBe(false);
	});

	it('folds permissionMode: \'plan\'', () => {
		expect(foldControlOptions({ permissionMode: 'plan' })).toEqual({ permissionMode: 'plan' });
	});

	it('folds permissionMode: \'yolo\'', () => {
		expect(foldControlOptions({ permissionMode: 'yolo' })).toEqual({ permissionMode: 'yolo' });
	});

	it('folds a non-normal permissionMode alongside the P6 fields without disturbing them', () => {
		const controls: TabControls = {
			model: 'claude-opus-4',
			mode: 'verbose',
			reasoning: { kind: 'effort', value: 'medium' },
			serviceTier: 'standard',
			permissionMode: 'yolo',
		};
		expect(foldControlOptions(controls)).toEqual({
			model: 'claude-opus-4',
			mode: 'verbose',
			reasoning: { kind: 'effort', value: 'medium' },
			serviceTier: 'standard',
			permissionMode: 'yolo',
		});
	});

	it('leaves the P6 fold byte-identical when permissionMode is normal (no extra key)', () => {
		const controls: TabControls = { model: 'claude-haiku', permissionMode: 'normal' };
		const folded = foldControlOptions(controls);
		expect(folded).toEqual({ model: 'claude-haiku' });
		expect('permissionMode' in folded).toBe(false);
	});

	it('is total — never throws when a permissionMode is present', () => {
		expect(() => foldControlOptions({ permissionMode: 'plan' })).not.toThrow();
		expect(() => foldControlOptions({ permissionMode: 'normal' })).not.toThrow();
		expect(() =>
			foldControlOptions({ model: 'm', permissionMode: 'yolo' }),
		).not.toThrow();
	});
});
