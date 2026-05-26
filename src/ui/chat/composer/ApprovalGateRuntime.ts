import type {
	ChatRuntimePort,
	RuntimeCapabilities,
	ToolbarCapabilities,
	ChatMessage,
	StreamChunk,
	ProviderId,
	ChatTurnRequest,
	PreparedChatTurn,
	ChatRuntimeQueryOptions,
	ChatRuntimeEnsureReadyOptions,
	Unsubscriber,
	AskUserQuestionRequest,
	AskUserQuestionAnswer,
	ExitPlanModeRequest,
	ExitPlanModeDecision,
	ApprovalRequest,
	ApprovalDecision,
} from '@/domain/ports';
import type { PermissionMode } from '@/domain/chat/PermissionMode';
import type { ApprovalManager, ApprovalAction } from '@/application/chat/approvals/ApprovalManager';

/** Reader for the active tab's permission mode (`controls.permissionMode ?? 'normal'`). */
type ModeReader = () => PermissionMode;

/** Fired after a prompted decision is applied so the surface can refresh the rule panel. */
type AfterApply = () => void;

/**
 * A `ChatRuntimePort` decorator (SPEC-AS-016) that gates the runtime's approval
 * callback through the per-surface `ApprovalManager` (P7). It is the **inner-most**
 * approval decorator — `EnqueueRuntime` (which renders the inline block) wraps THIS,
 * so an auto-decided approval never reaches the enqueue/render path:
 *
 * - The wrapped runtime pulls an approval → the gate derives the `ApprovalAction`
 *   (`toolName` from `req.tool`, `actionPattern` from `req.context`) + reads the active
 *   `mode`, then `manager.decide(action, mode)`.
 * - `ok('allow')`/`ok('deny')` → resolve the runtime callback DIRECTLY with that
 *   decision; the downstream `cb` (the enqueue + capture path) is NEVER invoked, so no
 *   inline block renders (auto-decision silent, REQ-AS-020/021/024).
 * - `ok('prompt')` (or a defensive `err`) → delegate to the downstream `cb` (which
 *   enqueues + captures the user's decision via `RespondToInlineBlockUseCase`); when the
 *   user answers, `manager.applyDecision(action, decision)` persists/sessions the rule
 *   and the concrete on-the-wire decision (`*-always` → `allow`/`deny`, cancel → `null`)
 *   resolves the runtime callback (REQ-AS-022/025/030/031).
 *
 * Every other member delegates verbatim to the inner runtime, so the per-tab streaming
 * isolation + the P4 ask-user/exit-plan callbacks are untouched. No `providerId` branch
 * (SPEC-AS-023). DTO-only, no `obsidian`, no Vue.
 */
export class ApprovalGateRuntime implements ChatRuntimePort {
	constructor(
		private readonly inner: ChatRuntimePort,
		private readonly manager: ApprovalManager,
		private readonly getMode: ModeReader,
		/** Optional — fired after a prompted `applyDecision` so the panel refreshes (REQ-AS-043). */
		private readonly onAfterApply?: AfterApply,
	) {}

	get providerId(): ProviderId {
		return this.inner.providerId;
	}

	prepareTurn(request: ChatTurnRequest): PreparedChatTurn {
		return this.inner.prepareTurn(request);
	}

	ensureReady(options?: ChatRuntimeEnsureReadyOptions): Promise<boolean> {
		return this.inner.ensureReady(options);
	}

	query(
		turn: PreparedChatTurn,
		conversationHistory?: ChatMessage[],
		queryOptions?: ChatRuntimeQueryOptions,
	): AsyncGenerator<StreamChunk> {
		return this.inner.query(turn, conversationHistory, queryOptions);
	}

	cancel(): void {
		this.inner.cancel();
	}

	getSessionId(): string | null {
		return this.inner.getSessionId();
	}

	resetSession(): void {
		this.inner.resetSession();
	}

	onReadyStateChange(listener: (ready: boolean) => void): Unsubscriber {
		return this.inner.onReadyStateChange(listener);
	}

	isReady(): boolean {
		return this.inner.isReady();
	}

	resumeSession(sessionId: string): void {
		this.inner.resumeSession(sessionId);
	}

	setResumeCheckpoint(assistantMessageId: string): void {
		this.inner.setResumeCheckpoint(assistantMessageId);
	}

	getCapabilities(): RuntimeCapabilities {
		return this.inner.getCapabilities();
	}

	getToolbarCapabilities(): ToolbarCapabilities {
		return this.inner.getToolbarCapabilities();
	}

	setAskUserQuestionCallback(
		cb: (req: AskUserQuestionRequest) => Promise<AskUserQuestionAnswer | null>,
	): void {
		this.inner.setAskUserQuestionCallback(cb);
	}

	setExitPlanModeCallback(
		cb: (req: ExitPlanModeRequest) => Promise<ExitPlanModeDecision | null>,
	): void {
		this.inner.setExitPlanModeCallback(cb);
	}

	setApprovalCallback(cb: (req: ApprovalRequest) => Promise<ApprovalDecision | null>): void {
		this.inner.setApprovalCallback((req) => this.gateApproval(req, cb));
	}

	/** The mode-gate → match → auto-OR-prompt → applyDecision flow (SPEC-AS-016/027). */
	private async gateApproval(
		req: ApprovalRequest,
		cb: (req: ApprovalRequest) => Promise<ApprovalDecision | null>,
	): Promise<ApprovalDecision | null> {
		const action = this.deriveAction(req);
		const decided = await this.manager.decide(action, this.getMode());
		if (decided.ok && (decided.value === 'allow' || decided.value === 'deny')) {
			// Auto-decision — resolve silently, never rendering the inline block.
			return decided.value;
		}
		// 'prompt' (or a defensive err) → surface the unchanged P4 block via `cb`, then
		// route the user's decision through `applyDecision` (persist/session the rule).
		const userDecision = await cb(req);
		const applied = await this.manager.applyDecision(action, userDecision);
		this.onAfterApply?.();
		return applied.ok ? applied.value : userDecision;
	}

	/**
	 * Derive the matchable action from the P4 `ApprovalRequest` (SPEC-AS-016). The P4
	 * request carries `tool` + `context` (no structured input), so the action pattern is
	 * the `context` string (the command/path/glob the runtime described); the matcher
	 * `\`→`/`-normalises + compares it (SPEC-AS-004).
	 */
	private deriveAction(req: ApprovalRequest): ApprovalAction {
		return { toolName: req.tool, actionPattern: req.context.length > 0 ? req.context : null };
	}
}
