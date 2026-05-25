/**
 * Inline exit-plan-mode DTOs (SPEC-CP-004). Plain domain data; no `obsidian`,
 * no `node:*`, no Vue, no class. Mirrors claudian `core/runtime/types.ts`
 * exit-plan request + the implement/revise/cancel decision.
 */
export interface ExitPlanModeRequest {
	readonly requestId: string;
	/** The plan text — may be long (the UI scrolls it, SPEC-CP-023). */
	readonly plan: string;
	readonly allowedPrompts?: { tool: string; prompt: string }[];
}

export type ExitPlanModeDecision =
	| { kind: 'implement' }
	/** `revise` carries the user's feedback text (REQ-CP-024). */
	| { kind: 'revise'; feedback: string }
	| { kind: 'cancel' };
