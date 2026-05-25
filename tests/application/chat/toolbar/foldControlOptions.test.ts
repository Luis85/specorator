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
