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
	LoggerPort,
} from '@/domain/ports';
import type { InlineBlockEntry } from './useComposerMode';

/** Enqueue a pending inline-block request onto the arbiter's depth-counted queue. */
type EnqueueFn = (entry: InlineBlockEntry, hooks?: { warn?: (msg: string) => void }) => boolean;

/**
 * A `ChatRuntimePort` decorator (SPEC-CP-018/028) that wraps the three inline
 * callback setters so a runtime-pulled ask-user / exit-plan / approval request
 * **enqueues for render** (the arbiter's depth-counted queue) BEFORE delegating to
 * the registered capture callback. Every other member delegates verbatim to the
 * inner runtime, so `RespondToInlineBlockUseCase` (built over this decorator) still
 * captures the runtime's awaiting `resolve` — keeping ONE registration per callback
 * (no last-wins conflict between rendering and answering). DTO-only, no `obsidian`.
 */
export class EnqueueRuntime implements ChatRuntimePort {
	constructor(
		private readonly inner: ChatRuntimePort,
		private readonly enqueue: EnqueueFn,
		private readonly logger: LoggerPort,
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

	// P6 (SPEC-TC-005): the decorator forwards the toolbar capability flags verbatim
	// to the inner runtime, like every other non-enqueued member.
	getToolbarCapabilities(): ToolbarCapabilities {
		return this.inner.getToolbarCapabilities();
	}

	setAskUserQuestionCallback(
		cb: (req: AskUserQuestionRequest) => Promise<AskUserQuestionAnswer | null>,
	): void {
		this.inner.setAskUserQuestionCallback((req) => {
			this.enqueue(
				{ kind: 'ask_user_question', request: req },
				{
					warn: (m): void => {
						this.logger.warn(m);
					},
				},
			);
			return cb(req);
		});
	}

	setExitPlanModeCallback(
		cb: (req: ExitPlanModeRequest) => Promise<ExitPlanModeDecision | null>,
	): void {
		this.inner.setExitPlanModeCallback((req) => {
			this.enqueue({ kind: 'exit_plan_mode', request: req });
			return cb(req);
		});
	}

	setApprovalCallback(cb: (req: ApprovalRequest) => Promise<ApprovalDecision | null>): void {
		this.inner.setApprovalCallback((req) => {
			this.enqueue({ kind: 'approval_request', request: req });
			return cb(req);
		});
	}
}
