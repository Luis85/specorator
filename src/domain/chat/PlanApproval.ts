/**
 * Plan-mode approval domain types (PR-ASV-2-plan-mode, agent-sidepanel-v2).
 *
 * Plan Mode is a Claude Code SDK/CLI concern, not a plugin feature. The SDK
 * emits an `ExitPlanMode` tool-use event when the model wants to surface a
 * plan for user approval. Our `ApprovalPort` mediates that handoff —
 * production wiring will resolve `requestPlanApproval` from the SDK
 * callback, the UI renders an `InlinePlanApprovalCard.vue` and the user's
 * decision threads back through the port.
 *
 * Inspired by Claudian's `InlinePlanApproval.ts` / `InlineExitPlanMode.ts`
 * (https://github.com/YishenTu/claudian) but flattened to a single
 * approval shape — Specorator's `FileWriteProposalCard` (REQ-ASM-044)
 * handles per-file write approval; this surface is plan-level only.
 */

export type PlanDecision =
	| { readonly type: 'implement' }
	| { readonly type: 'revise'; readonly text: string }
	| { readonly type: 'cancel' };

export interface PlanApprovalRequest {
	/** Unique per request — used as the Vue `:key`. */
	readonly id: string;
	/**
	 * The plan content as markdown. The card renders this via
	 * `MarkdownBlock.vue` so it picks up the same renderer (hand-rolled in
	 * jsdom tests; Obsidian's native renderer in production).
	 */
	readonly planMarkdown: string;
	/**
	 * Optional list of permissions the model requests if approved
	 * (e.g. `Bash`, `Write`). Surfaced in the card's body so the user
	 * sees what they're authorising.
	 */
	readonly allowedPrompts?: readonly string[];
}
