/**
 * Inline plan-approval DTOs (SPEC-CP-004). Plain domain data; no `obsidian`,
 * no `node:*`, no Vue, no class. `ApprovalDecision` is the exact claudian
 * `core/types/tools.ts` union. **`'allow-always'` carries NO persistence field**
 * — P4 routes the decision for the current request only; the rule store is P7
 * (NG3, REQ-CP-026).
 */
export type ApprovalDecision = 'deny' | 'allow' | 'allow-always';

export interface ApprovalOption {
	readonly decision: ApprovalDecision;
	/** 'Deny' / 'Allow once' / 'Always allow' (REQ-CP-026). */
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
