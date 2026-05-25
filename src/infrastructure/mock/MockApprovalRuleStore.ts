import type { ApprovalRuleStorePort } from '@/domain/ports';
import type { ApprovalRule, ApprovalRuleInput } from '@/domain/chat/approvals/ApprovalRule';
import { ruleDedupeKey } from '@/domain/chat/approvals/ApprovalRule';
import type { Result } from '@/domain/shared/Result';
import { ok, err } from '@/domain/shared/Result';

/** Which store operation the failure-injection switch forces to `Result.err`. */
export type MockApprovalStoreFailMode = 'none' | 'load' | 'save';

/**
 * Scriptable in-memory `ApprovalRuleStorePort` (SPEC-AS-008, ADR-AS-001 §4) for unit
 * tests + `npm run dev`. The `ApprovalManager` + `ApprovalsPanel` tests inject it
 * instead of a real provider:
 *
 *   - `seedRules(rules)` pre-populates persisted rules (drives the matched-allow/deny +
 *     reload tests TEST-AS-020/021/032);
 *   - `loadRules`/`addRule` (dedupe by `ruleDedupeKey`, open item #2 — a same-triple add
 *     is a no-op `ok(existing)`, an opposite-decision triple is appended) / `removeRule`
 *     (idempotent) / `clear` operate on the in-memory array, all `Promise<Result<…>>`;
 *   - `setFailMode('load' | 'save' | 'none')` forces `loadRules` / `addRule` to return
 *     `Result.err` so the fail-safe-to-prompt test (TEST-AS-054, REQ-AS-054) runs
 *     deterministically.
 *
 * Total — never throws across the boundary (NFR-AS-010): a forced fault is an `err`
 * value, never a throw. Only the persisted lifetime lives here — session rules stay in
 * `ApprovalManager` memory (SPEC-AS-010). No `obsidian`, no `node:*`.
 */
export class MockApprovalRuleStore implements ApprovalRuleStorePort {
	private rules: ApprovalRule[] = [];
	private failMode: MockApprovalStoreFailMode = 'none';
	private idSeq = 0;

	/** Test hook: pre-populate the persisted rule set (replaces the current contents). */
	seedRules(rules: readonly ApprovalRule[]): void {
		this.rules = [...rules];
	}

	/** Test hook: force `loadRules`/`addRule` to `Result.err` (the fail-safe driver). */
	setFailMode(mode: MockApprovalStoreFailMode): void {
		this.failMode = mode;
	}

	loadRules(): Promise<Result<readonly ApprovalRule[]>> {
		if (this.failMode === 'load') {
			return Promise.resolve(err(new Error('mock approval store: forced load failure')));
		}
		return Promise.resolve(ok([...this.rules]));
	}

	addRule(input: ApprovalRuleInput): Promise<Result<ApprovalRule>> {
		if (this.failMode === 'save') {
			return Promise.resolve(err(new Error('mock approval store: forced save failure')));
		}
		const key = ruleDedupeKey(input);
		const existing = this.rules.find((r) => ruleDedupeKey(r) === key);
		if (existing !== undefined) return Promise.resolve(ok(existing));
		const stored: ApprovalRule = {
			...input,
			id: `mock-rule-${(this.idSeq += 1)}`,
			createdAt: Date.now(),
		};
		this.rules.push(stored);
		return Promise.resolve(ok(stored));
	}

	removeRule(id: string): Promise<Result<void>> {
		this.rules = this.rules.filter((r) => r.id !== id);
		return Promise.resolve(ok(undefined));
	}

	clear(): Promise<Result<void>> {
		this.rules = [];
		return Promise.resolve(ok(undefined));
	}
}
