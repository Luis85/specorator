/**
 * T-AS-006 (TEST-AS-016 DTO leg) — RED: the `ApprovalRule` DTO + `ApprovalRuleInput`
 * + `ruleDedupeKey` (`@/domain/chat/approvals/ApprovalRule`). The interface is
 * EXACTLY the six `readonly` members; `ApprovalRuleInput = Omit<ApprovalRule, 'id' |
 * 'createdAt'>`; `ruleDedupeKey(r)` returns the `${toolName} ${actionPattern ?? ''}
 * ${decision}` triple so two rules with the same tool/pattern/decision share a key
 * and an absent vs `''` pattern collapse to the same key. Plain inert data — no
 * secret/token field — that crosses the Pinia store boundary cleanly (NFR-AS-008).
 *
 * Fails until T-AS-007 creates `ApprovalRule.ts` + the barrel re-export.
 *
 * Traces: TEST-AS-016, SPEC-AS-005, SPEC-AS-024, REQ-AS-016/030/031, NFR-AS-002,
 * NFR-AS-008.
 */
import { describe, it, expect } from 'vitest';
import type { ApprovalRule, ApprovalRuleInput } from '@/domain/chat/approvals/ApprovalRule';
import { ruleDedupeKey } from '@/domain/chat/approvals/ApprovalRule';
// Re-exported from the approvals barrel for one-stop import.
import type {
	ApprovalRule as RuleFromBarrel,
	ApprovalRuleInput as InputFromBarrel,
} from '@/domain/chat/approvals';

type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type HasKey<T, K extends PropertyKey> = K extends keyof T ? true : false;

// ---- ApprovalRule is EXACTLY the six readonly members ----
const _keys: Equals<
	keyof ApprovalRule,
	'id' | 'toolName' | 'actionPattern' | 'decision' | 'lifetime' | 'createdAt'
> = true;
const _id: Equals<ApprovalRule['id'], string> = true;
const _toolName: Equals<ApprovalRule['toolName'], string> = true;
const _actionPattern: Equals<ApprovalRule['actionPattern'], string | undefined> = true;
const _decision: Equals<ApprovalRule['decision'], 'allow' | 'deny'> = true;
const _lifetime: Equals<ApprovalRule['lifetime'], 'session' | 'persisted'> = true;
const _createdAt: Equals<ApprovalRule['createdAt'], number> = true;
void _keys;
void _id;
void _toolName;
void _actionPattern;
void _decision;
void _lifetime;
void _createdAt;

// No secret/token field (NFR-AS-002) — the DTO carries only inert match data.
const _noSecret: Equals<HasKey<ApprovalRule, 'secret'>, false> = true;
const _noToken: Equals<HasKey<ApprovalRule, 'token'>, false> = true;
void _noSecret;
void _noToken;

// ---- ApprovalRuleInput omits id + createdAt (the store mints them) ----
const _inputKeys: Equals<
	keyof ApprovalRuleInput,
	'toolName' | 'actionPattern' | 'decision' | 'lifetime'
> = true;
const _inputIsOmit: Equals<ApprovalRuleInput, Omit<ApprovalRule, 'id' | 'createdAt'>> = true;
void _inputKeys;
void _inputIsOmit;

// ---- The barrel re-export is the same type ----
const _ruleBarrelSame: Equals<ApprovalRule, RuleFromBarrel> = true;
const _inputBarrelSame: Equals<ApprovalRuleInput, InputFromBarrel> = true;
void _ruleBarrelSame;
void _inputBarrelSame;

describe('ApprovalRule DTO shape (TEST-AS-016)', () => {
	it('constructs the six-member inert rule', () => {
		const rule: ApprovalRule = {
			id: 'r1',
			toolName: 'Bash',
			actionPattern: 'git *',
			decision: 'allow',
			lifetime: 'persisted',
			createdAt: 1_700_000_000_000,
		};
		expect(Object.keys(rule).sort()).toEqual([
			'actionPattern',
			'createdAt',
			'decision',
			'id',
			'lifetime',
			'toolName',
		]);
	});

	it('allows an absent actionPattern (match-all for the tool)', () => {
		const rule: ApprovalRule = {
			id: 'r2',
			toolName: 'Write',
			decision: 'deny',
			lifetime: 'session',
			createdAt: 1,
		};
		expect(rule.actionPattern).toBeUndefined();
	});
});

describe('ruleDedupeKey triple (TEST-AS-016)', () => {
	it('joins toolName + actionPattern + decision', () => {
		expect(
			ruleDedupeKey({ toolName: 'Bash', actionPattern: 'git *', decision: 'allow' }),
		).toBe('Bash git * allow');
	});

	it('collapses an absent vs empty pattern to the same key', () => {
		const absent = ruleDedupeKey({ toolName: 'Write', decision: 'deny' });
		const empty = ruleDedupeKey({ toolName: 'Write', actionPattern: '', decision: 'deny' });
		expect(absent).toBe('Write  deny');
		expect(absent).toBe(empty);
	});

	it('distinguishes the opposite decision (so deny-wins can apply)', () => {
		const allow = ruleDedupeKey({ toolName: 'Bash', actionPattern: 'rm *', decision: 'allow' });
		const deny = ruleDedupeKey({ toolName: 'Bash', actionPattern: 'rm *', decision: 'deny' });
		expect(allow).not.toBe(deny);
	});

	it('two rules with the same tool/pattern/decision share a key', () => {
		const a: ApprovalRule = {
			id: 'a',
			toolName: 'Read',
			actionPattern: '/notes',
			decision: 'allow',
			lifetime: 'persisted',
			createdAt: 1,
		};
		const b: ApprovalRule = {
			id: 'b',
			toolName: 'Read',
			actionPattern: '/notes',
			decision: 'allow',
			lifetime: 'session',
			createdAt: 2,
		};
		expect(ruleDedupeKey(a)).toBe(ruleDedupeKey(b));
	});
});
