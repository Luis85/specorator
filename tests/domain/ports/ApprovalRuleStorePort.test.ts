/**
 * T-AS-008 (TEST-AS-053 port-shape leg) — RED: `ApprovalRuleStorePort` exposes
 * EXACTLY the four `Result`-typed methods (`loadRules` / `addRule` / `removeRule` /
 * `clear`); `APPROVAL_RULE_STORE_PORT` is its OWN `InjectionKey` in
 * `@/infrastructure/bridge/ports` (no aggregate); the barrel `@/domain/ports`
 * re-exports `ApprovalRuleStorePort` / `ApprovalRule` / `ApprovalRuleInput` /
 * `PermissionMode`. The behavioural store contract (load-or-default, dedupe,
 * idempotent remove) is the Mock/LS leg (T-AS-013/015).
 *
 * Fails `vue-tsc -p tsconfig.lint.json` until T-AS-009 adds the port + key + barrel.
 *
 * Traces: TEST-AS-053, SPEC-AS-006, REQ-AS-001/032/033/034/053, NFR-AS-005.
 */
import { describe, it, expect } from 'vitest';
import type { InjectionKey } from 'vue';
import type { ApprovalRuleStorePort } from '@/domain/ports/ApprovalRuleStorePort';
import type {
	ApprovalRuleStorePort as PortFromBarrel,
	ApprovalRule,
	ApprovalRuleInput,
	PermissionMode,
} from '@/domain/ports';
import { APPROVAL_RULE_STORE_PORT } from '@/infrastructure/bridge/ports';
import type { Result } from '@/domain/shared/Result';

type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// ---- The barrel re-export is the same type as the own module ----
const _barrelSame: Equals<ApprovalRuleStorePort, PortFromBarrel> = true;
void _barrelSame;

// ---- The port exposes EXACTLY the four methods ----
const _members: Equals<
	keyof ApprovalRuleStorePort,
	'loadRules' | 'addRule' | 'removeRule' | 'clear'
> = true;
void _members;

// ---- Each method is Result-typed (the exact signatures) ----
const _loadRules: Equals<
	ApprovalRuleStorePort['loadRules'],
	() => Promise<Result<readonly ApprovalRule[]>>
> = true;
const _addRule: Equals<
	ApprovalRuleStorePort['addRule'],
	(input: ApprovalRuleInput) => Promise<Result<ApprovalRule>>
> = true;
const _removeRule: Equals<
	ApprovalRuleStorePort['removeRule'],
	(id: string) => Promise<Result<void>>
> = true;
const _clear: Equals<ApprovalRuleStorePort['clear'], () => Promise<Result<void>>> = true;
void _loadRules;
void _addRule;
void _removeRule;
void _clear;

// ---- The key is its own InjectionKey<ApprovalRuleStorePort> ----
const _key: Equals<typeof APPROVAL_RULE_STORE_PORT, InjectionKey<ApprovalRuleStorePort>> = true;
void _key;

// ---- The barrel re-exports the rule DTOs + PermissionMode for one-stop import ----
const _ruleOk: Equals<ApprovalRule['decision'], 'allow' | 'deny'> = true;
const _inputOk: Equals<ApprovalRuleInput, Omit<ApprovalRule, 'id' | 'createdAt'>> = true;
const _modeOk: Equals<PermissionMode, 'normal' | 'plan' | 'yolo'> = true;
void _ruleOk;
void _inputOk;
void _modeOk;

describe('ApprovalRuleStorePort shape + key (TEST-AS-053)', () => {
	it('the InjectionKey is a Symbol', () => {
		expect(typeof APPROVAL_RULE_STORE_PORT).toBe('symbol');
	});

	it('an implementation satisfies the four Result-typed method contract', async () => {
		const rules: ApprovalRule[] = [];
		const port: ApprovalRuleStorePort = {
			loadRules: () => Promise.resolve({ ok: true, value: rules }),
			addRule: (input) =>
				Promise.resolve({
					ok: true,
					value: { ...input, id: 'r1', createdAt: 1 },
				}),
			removeRule: () => Promise.resolve({ ok: true, value: undefined }),
			clear: () => Promise.resolve({ ok: true, value: undefined }),
		};
		const loaded = await port.loadRules();
		expect(loaded.ok).toBe(true);
		const added = await port.addRule({
			toolName: 'Bash',
			actionPattern: 'git *',
			decision: 'allow',
			lifetime: 'persisted',
		});
		expect(added.ok && added.value.id).toBe('r1');
	});
});
