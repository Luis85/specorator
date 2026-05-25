/**
 * Where a fork lands (SPEC-TS-023, resolved design item #2). New-tab is the
 * primary/default option; current-tab forks the active conversation in place.
 */
export type ForkTarget = 'new-tab' | 'current-tab';

/**
 * Resolve the fork-target modal's selected option to a validated `ForkTarget`
 * (SPEC-TS-013/023, REQ-TS-017). Pure/total — an unrecognised or dismissed option
 * (`null`/`''`/anything else) → `null`; never throws. The Obsidian `ForkTargetModal`
 * (coverage-excluded) is a thin shell over this mapping; the caller (SPEC-TS-031)
 * runs `ForkConversationUseCase` then opens the plan into the chosen target.
 */
export function chooseForkTarget(option: string | null): ForkTarget | null {
	if (option === 'new-tab' || option === 'current-tab') return option;
	return null;
}
