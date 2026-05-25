/**
 * The approval-rule DTO (P7, SPEC-AS-005, ADR-AS-001 §1). Plain domain data —
 * `readonly` string/number/enum only, no class, no `obsidian`, no `node:*`, no Vue
 * — so it crosses the Pinia store boundary cleanly (NFR-AS-008) and serialises
 * without a domain handle. **The DTO carries no secret/token/path-outside-the-vault**
 * — it is inert data, never executable (NFR-AS-002, SPEC-AS-024). Claudian
 * ground-truth: the rule shape `{ toolName, ruleContent? }` + `behavior:'allow'`
 * (`ClaudePermissionUpdates.ts:30`).
 */
export interface ApprovalRule {
	/** Stable opaque id (the store mints it; removal targets it). */
	readonly id: string;
	/** The matched tool (e.g. `'Bash'`, `'Write'`); non-empty. */
	readonly toolName: string;
	/**
	 * The `\`→`/`-normalised match pattern. **Absent** ⇒ match-all for the tool —
	 * this is the case when the derived pattern is `'*'`/none OR begins with `{`
	 * (the `getActionPattern` `JSON.stringify(input)` fallback is stored without
	 * content so no serialised input lands in the store, open item #3 / NFR-AS-002).
	 */
	readonly actionPattern?: string;
	/** Specorator adds the explicit deny alongside allow (CLAR-AS-004). */
	readonly decision: 'allow' | 'deny';
	/** `'persisted'` ⇒ the device-local store; `'session'` ⇒ `ApprovalManager` memory. */
	readonly lifetime: 'session' | 'persisted';
	/** Epoch ms at creation (display ordering only); a finite non-negative integer. */
	readonly createdAt: number;
}

/** What the use case hands the store to persist (the store mints `id`/`createdAt`). */
export type ApprovalRuleInput = Omit<ApprovalRule, 'id' | 'createdAt'>;

/**
 * The dedupe identity (resolved open item #2): same tool + same pattern + same
 * decision = the same rule. Returns `` `${toolName} ${actionPattern ?? ''}
 * ${decision}` `` so an absent vs empty pattern collapse to the same key and an
 * opposite-decision rule for the same tool/pattern stays distinct (deny-wins can
 * apply). Pure — string-only, never throws.
 */
export function ruleDedupeKey(
	r: Pick<ApprovalRule, 'toolName' | 'actionPattern' | 'decision'>,
): string {
	return `${r.toolName} ${r.actionPattern ?? ''} ${r.decision}`;
}
