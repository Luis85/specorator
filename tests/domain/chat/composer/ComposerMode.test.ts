/**
 * T-CP-002 (TEST-CP-006) — RED: the `ComposerMode` value types match SPEC-CP-006.
 *
 * Asserts the `ComposerModeKind` union covers EXACTLY the seven kinds
 * (default/slash/skills/mention/instruction/bang-bash/inline-block); `planActive`
 * is an orthogonal boolean BESIDE the union (not a member of it); and `TriggerHit`
 * is `{ kind: 'slash'|'skills'|'mention'; tokenStart: number; filter: string }`.
 *
 * Fails `vue-tsc -p tsconfig.lint.json` until T-CP-004 creates the value types.
 *
 * Traces: TEST-CP-006, SPEC-CP-006, REQ-CP-034, NFR-CP-005.
 */
import { describe, it, expect } from 'vitest';
import type {
	ComposerModeKind,
	ComposerMode,
	TriggerHit,
} from '@/domain/chat/composer/ComposerMode';

type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// ---- exactly the seven kinds ----
type ExpectedKinds =
	| 'default'
	| 'slash'
	| 'skills'
	| 'mention'
	| 'instruction'
	| 'bang-bash'
	| 'inline-block';
const _exactKinds: Equals<ComposerModeKind, ExpectedKinds> = true;
void _exactKinds;

// `planActive` is NOT a member of the kind union (orthogonal).
const _planNotAKind: Equals<Extract<ComposerModeKind, 'planActive'>, never> = true;
void _planNotAKind;

// ---- ComposerMode = { kind, planActive } ----
const _modeShape: Equals<
	ComposerMode,
	{ readonly kind: ComposerModeKind; readonly planActive: boolean }
> = true;
const _modeExactKeys: Equals<keyof ComposerMode, 'kind' | 'planActive'> = true;
void _modeShape;
void _modeExactKeys;

// ---- TriggerHit shape ----
const _triggerShape: Equals<
	TriggerHit,
	{ readonly kind: 'slash' | 'skills' | 'mention'; readonly tokenStart: number; readonly filter: string }
> = true;
void _triggerShape;

describe('ComposerMode value types (TEST-CP-006)', () => {
	it('the seven kinds are constructible and planActive is orthogonal', () => {
		const kinds: ComposerModeKind[] = [
			'default',
			'slash',
			'skills',
			'mention',
			'instruction',
			'bang-bash',
			'inline-block',
		];
		expect(kinds).toHaveLength(7);
		const planWhileSlash: ComposerMode = { kind: 'slash', planActive: true };
		expect(planWhileSlash.kind).toBe('slash');
		expect(planWhileSlash.planActive).toBe(true);
	});

	it('TriggerHit carries kind / tokenStart / filter', () => {
		const hit: TriggerHit = { kind: 'mention', tokenStart: 8, filter: 'no' };
		expect(hit.kind).toBe('mention');
		expect(hit.tokenStart).toBe(8);
		expect(hit.filter).toBe('no');
	});
});
