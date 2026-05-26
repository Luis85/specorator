/**
 * The approval-rule store port (P7, SPEC-AS-006a, ADR-AS-001 §2). One narrow
 * store-only port for one consumer kind (the approvals use cases); its own
 * `InjectionKey` + composable, no aggregate (ADR-008, NFR-AS-005). It handles
 * **only the persisted lifetime** — session rules live in `ApprovalManager` memory
 * (SPEC-AS-010). Every method is `Result`-typed (ADR-004); a store failure never
 * throws across the boundary — it surfaces as `Result.err` (NFR-AS-010), letting the
 * engine fail safe to prompt (REQ-AS-054). No class, no `obsidian`, no `node:*`.
 */
import type { Result } from '@/domain/shared/Result';
import type { ApprovalRule, ApprovalRuleInput } from '@/domain/chat/approvals/ApprovalRule';

export interface ApprovalRuleStorePort {
	/**
	 * Load-or-default the persisted rules (REQ-AS-032). An empty/absent/unparseable
	 * store ⇒ `ok([])` — NO migration (CHARTER-REQ-FRESH). A true store-read failure
	 * ⇒ `err` (the engine fails safe to prompt, REQ-AS-054). No side effects.
	 */
	loadRules(): Promise<Result<readonly ApprovalRule[]>>;
	/**
	 * Persist a rule (REQ-AS-030); DEDUPE by `ruleDedupeKey` (open item #2) — a
	 * same-triple persisted rule is a no-op `ok(existing)` (no write). Else mint
	 * `id`/`createdAt`, append, write, `ok(stored)`. A write failure ⇒ `err` (the
	 * engine still resolves the user's decision; the persist failure surfaces a
	 * notice, never blocks the allow/deny, SPEC-AS-010). One device-local write.
	 */
	addRule(input: ApprovalRuleInput): Promise<Result<ApprovalRule>>;
	/**
	 * Delete the persisted rule with `id` (REQ-AS-042). Idempotent — a missing id is a
	 * no-op `ok()`. A write failure ⇒ `err`. One write.
	 */
	removeRule(id: string): Promise<Result<void>>;
	/** Clear all persisted rules → `ok()`. A write failure ⇒ `err`. One write. */
	clear(): Promise<Result<void>>;
}
