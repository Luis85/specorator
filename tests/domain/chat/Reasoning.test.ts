/**
 * T-TC-002 (TEST-TC-018 type-shape leg) — RED: `Reasoning.ts` exports the closed
 * lower-case `ReasoningEffort` union (`'high' | 'medium' | 'low'`) and the
 * two-member `readonly` discriminated `ReasoningChoice`
 * (`{kind:'effort';value:ReasoningEffort}` | `{kind:'budget';tokens:number}`),
 * narrowing on `kind`, re-exported from `@/domain/chat/Reasoning` and surfaced
 * through `@/domain/ports`.
 *
 * Fails `vue-tsc -p tsconfig.lint.json` until T-TC-003 adds `Reasoning.ts`.
 *
 * Traces: TEST-TC-018, SPEC-TC-002, REQ-TC-017, REQ-TC-018.
 */
import { describe, it, expect } from 'vitest';
import type { ReasoningChoice, ReasoningEffort } from '@/domain/chat/Reasoning';
// The union is also surfaced through the ports barrel (SPEC-TC-002).
import type { ReasoningChoice as ReasoningChoiceFromPorts } from '@/domain/ports';

type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// ---- ReasoningEffort is EXACTLY the closed lower-case union ----
const _effortExact: Equals<ReasoningEffort, 'high' | 'medium' | 'low'> = true;
void _effortExact;

// ---- ReasoningChoice is EXACTLY the two-member discriminated union ----
type ExpectedChoice =
	| { readonly kind: 'effort'; readonly value: ReasoningEffort }
	| { readonly kind: 'budget'; readonly tokens: number };
const _choiceExact: Equals<ReasoningChoice, ExpectedChoice> = true;
void _choiceExact;

// ---- The barrel re-export is the same type ----
const _barrelSame: Equals<ReasoningChoice, ReasoningChoiceFromPorts> = true;
void _barrelSame;

// ---- The discriminant `kind` is the narrowing key ----
type EffortVariant = Extract<ReasoningChoice, { kind: 'effort' }>;
type BudgetVariant = Extract<ReasoningChoice, { kind: 'budget' }>;
const _effortValue: Equals<EffortVariant['value'], ReasoningEffort> = true;
const _budgetTokens: Equals<BudgetVariant['tokens'], number> = true;
void _effortValue;
void _budgetTokens;

describe('ReasoningChoice discriminated union (TEST-TC-018)', () => {
	it('narrows on kind', () => {
		const choices: ReasoningChoice[] = [
			{ kind: 'effort', value: 'high' },
			{ kind: 'budget', tokens: 8192 },
		];
		const seen: string[] = [];
		for (const choice of choices) {
			if (choice.kind === 'effort') {
				// `value` is a ReasoningEffort here.
				seen.push(`effort:${choice.value}`);
			} else {
				// `tokens` is a number here.
				seen.push(`budget:${choice.tokens}`);
			}
		}
		expect(seen).toEqual(['effort:high', 'budget:8192']);
	});

	it('accepts each effort level', () => {
		const levels: ReasoningEffort[] = ['high', 'medium', 'low'];
		const made: ReasoningChoice[] = levels.map((value) => ({ kind: 'effort', value }));
		expect(made.map((c) => (c.kind === 'effort' ? c.value : null))).toEqual([
			'high',
			'medium',
			'low',
		]);
	});
});
