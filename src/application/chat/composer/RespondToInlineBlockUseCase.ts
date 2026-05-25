import { ok, err, type Result } from '@/domain/shared/Result';
import type {
	ChatRuntimePort,
	AskUserQuestionRequest,
	AskUserQuestionAnswer,
	ExitPlanModeRequest,
	ExitPlanModeDecision,
	ApprovalRequest,
	ApprovalDecision,
} from '@/domain/ports';

/**
 * Raised when a `respond*` is attempted on a runtime whose
 * `supportsInlineResponse` capability is `false` (SPEC-CP-017, REQ-CP-028). The
 * callback is NEVER reached and no response is lost — the block was rendered
 * read-only + a notice (SPEC-CP-022..024).
 */
export class InlineResponseUnavailableError extends Error {
	constructor() {
		super('This runtime cannot answer inline blocks (supportsInlineResponse is false).');
		this.name = 'InlineResponseUnavailableError';
	}
}

/** A captured pending request: the `resolve` of the promise the runtime is awaiting. */
type PendingResolve<TDecision> = ((decision: TDecision | null) => void) | null;

/**
 * RespondToInlineBlockUseCase — the capability-gate boundary for inline-block
 * responses (SPEC-CP-017/032, REQ-CP-023/025/026/028). Registers the runtime's
 * three callbacks (ADR-CP-004 §1) and captures each pending request's `resolve`;
 * the UI's `respond*` then routes the user's decision back to the awaiting runtime.
 *
 * - **Capability-gated (REQ-CP-028, SPEC-CP-032):** each `respond*` reads
 *   `runtime.getCapabilities().supportsInlineResponse` FIRST. When `false` it
 *   returns `Result.err(InlineResponseUnavailableError)` WITHOUT reaching the
 *   callback — no response is lost (EC-CP-6). When `true` it resolves the awaiting
 *   callback with the decision (a `null` decision resolves with `null` = cancel,
 *   REQ-CP-022/033); the runtime decides how to proceed (its concern, not P4's).
 * - **No rule persisted (NG3, REQ-CP-026):** `respondApproval('allow-always')`
 *   routes the decision for the CURRENT request only — the use case has no
 *   `SettingsPort`/history dependency, so it writes nothing (the rule store is P7).
 *
 * Gated via `getCapabilities()`, NEVER by branching on the provider id
 * (SPEC-CP-032). `Result`-returning (ADR-004); no `obsidian`/Vue import.
 */
export class RespondToInlineBlockUseCase {
	private askUserResolve: PendingResolve<AskUserQuestionAnswer> = null;
	private exitPlanResolve: PendingResolve<ExitPlanModeDecision> = null;
	private approvalResolve: PendingResolve<ApprovalDecision> = null;

	constructor(private readonly runtime: ChatRuntimePort) {
		this.runtime.setAskUserQuestionCallback(
			(_req: AskUserQuestionRequest) =>
				new Promise<AskUserQuestionAnswer | null>((resolve) => {
					this.askUserResolve = resolve;
				}),
		);
		this.runtime.setExitPlanModeCallback(
			(_req: ExitPlanModeRequest) =>
				new Promise<ExitPlanModeDecision | null>((resolve) => {
					this.exitPlanResolve = resolve;
				}),
		);
		this.runtime.setApprovalCallback(
			(_req: ApprovalRequest) =>
				new Promise<ApprovalDecision | null>((resolve) => {
					this.approvalResolve = resolve;
				}),
		);
	}

	respondAskUserQuestion(answer: AskUserQuestionAnswer | null): Result<void> {
		return this.resolvePending(this.askUserResolve, answer, () => {
			this.askUserResolve = null;
		});
	}

	respondExitPlanMode(decision: ExitPlanModeDecision | null): Result<void> {
		return this.resolvePending(this.exitPlanResolve, decision, () => {
			this.exitPlanResolve = null;
		});
	}

	respondApproval(decision: ApprovalDecision | null): Result<void> {
		// `'allow-always'` routes here like any other decision — P4 persists NO rule (NG3).
		return this.resolvePending(this.approvalResolve, decision, () => {
			this.approvalResolve = null;
		});
	}

	/**
	 * The shared gate: read `supportsInlineResponse` FIRST. False → `err` (callback
	 * never reached, no lost response). True → resolve the awaiting callback with the
	 * decision and clear the held handle.
	 */
	private resolvePending<TDecision>(
		resolve: PendingResolve<TDecision>,
		decision: TDecision | null,
		clear: () => void,
	): Result<void> {
		if (!this.runtime.getCapabilities().supportsInlineResponse) {
			return err(new InlineResponseUnavailableError());
		}
		if (resolve !== null) {
			resolve(decision);
			clear();
		}
		return ok(undefined);
	}
}
