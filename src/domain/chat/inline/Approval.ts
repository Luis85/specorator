/**
 * Inline plan-approval DTOs (SPEC-CP-004). Plain domain data; no `obsidian`,
 * no `node:*`, no Vue, no class. **P7 grows the union additively** by the fourth
 * member `'deny-always'` (SPEC-AS-003, ADR-AS-003 §3) so the inline block offers
 * a persist-deny rule; the three P4 members stay byte-identical. The decision
 * carries NO persistence field — `'allow-always'`/`'deny-always'` are the
 * persist-a-rule flavours routed by `ApprovalManager` (SPEC-AS-010), the rule
 * itself is the `ApprovalRule` DTO (SPEC-AS-005).
 */
export type ApprovalDecision = 'deny' | 'allow' | 'allow-always' | 'deny-always';

export interface ApprovalOption {
	readonly decision: ApprovalDecision;
	/** 'Deny once' / 'Allow once' / 'Always allow' / 'Always deny' (REQ-CP-026, REQ-AS-030). */
	readonly label: string;
}

export interface ApprovalRequest {
	readonly requestId: string;
	/** The action's tool name (render-only). */
	readonly tool: string;
	/** Human-readable action context (render-only). */
	readonly context: string;
	readonly options: ApprovalOption[];
}
