/**
 * Composer-mode value types (SPEC-CP-006, ADR-CP-001 §1). Pure DTO/value types —
 * no Vue, no `obsidian`, no `node:*`, no class. The mode lives in a composable
 * `ref` (SPEC-CP-018); it crosses no store boundary. The trigger *parse* that
 * produces a `TriggerHit` is SPEC-CP-012 (application) — there is no behaviour
 * here.
 */
export type ComposerModeKind =
	| 'default' // P1 send contract in force (REQ-CP-035)
	| 'slash' // '/' palette open
	| 'skills' // '$' palette open
	| 'mention' // '@' palette open
	| 'instruction' // '#' at empty input
	| 'bang-bash' // '!' at empty input
	| 'inline-block'; // an ask-user/exit-plan/plan-approval block replaces the composer (REQ-CP-027)

export interface ComposerMode {
	readonly kind: ComposerModeKind;
	/**
	 * Plan mode is ORTHOGONAL (REQ-CP-020) — beside the union, not a member; it
	 * coexists with default/slash/etc. Toggled by Shift+Tab iff `supportsPlanMode`.
	 */
	readonly planActive: boolean;
}

/** The pure trigger-parse result (SPEC-CP-012). */
export interface TriggerHit {
	readonly kind: 'slash' | 'skills' | 'mention';
	/** Caret index where the trigger char sits. */
	readonly tokenStart: number;
	/** The text typed after the trigger (drives the palette filter). */
	readonly filter: string;
}
