import type { Unsubscriber } from './shared';
import type { ProviderId } from '@/domain/chat/ProviderId';
import type { StreamChunk } from '@/domain/chat/StreamChunk';
import type { ChatMessage } from '@/domain/chat/ChatMessage';
import type {
	ChatTurnRequest,
	PreparedChatTurn,
	ChatRuntimeQueryOptions,
	ChatRuntimeEnsureReadyOptions,
} from '@/domain/chat/ChatTurn';
import type {
	AskUserQuestionRequest,
	AskUserQuestionAnswer,
	ExitPlanModeRequest,
	ExitPlanModeDecision,
	ApprovalRequest,
	ApprovalDecision,
} from '@/domain/chat/inline';

/**
 * Provider capability flags (SPEC-TS-003) — gate the fork/rewind UI affordances.
 * Read through the port, NEVER branched on by `providerId` (REQ-TS-026). P4
 * (SPEC-CP-002, ADR-CP-004 §3) APPENDS `supportsPlanMode` / `supportsInlineResponse`
 * — the three P3 flags stay byte-identical (SPEC-CP-034).
 */
export interface RuntimeCapabilities {
	readonly supportsFork: boolean;
	readonly supportsRewind: boolean;
	// ---- P4 additive (SPEC-CP-002, ADR-CP-004 §3) ----
	/** Gates the Shift+Tab plan-mode toggle (REQ-CP-020). */
	readonly supportsPlanMode: boolean;
	/** Gates the answerable inline blocks (REQ-CP-028); false → read-only + notice. */
	readonly supportsInlineResponse: boolean;
}

/**
 * The streaming + lifecycle subset of Claudian's ChatRuntime (`ChatRuntime.ts:20`),
 * blessed by ADR-CC-001. The nine P1 members (SPEC-CC-001) keep every name +
 * signature byte-identical (REQ-TS-028); P3 (SPEC-TS-003, ADR-TS-002 §3) APPENDS
 * three additive members + `RuntimeCapabilities`, realising the P1 doc-comment's
 * "DEFERRED" note for the session ops + `getCapabilities`. The remaining deferred
 * members (`rewind`, `steer`, the callback setters, subagent hooks,
 * `getSupportedCommands`) stay excluded and grow additively in a later phase.
 *
 * Error convention (ADR-CC-001 §1, UNCHANGED): `query` streams; **expected streaming
 * failure is the `{type:'error';content}` `StreamChunk` member, not a thrown error /
 * `Result`**. The non-streaming lifecycle methods return their natural type
 * (`ensureReady → Promise<boolean>`). The three P3 members are non-streaming and
 * non-`Result` — two `void` runtime-state setters + one pure getter.
 */
export interface ChatRuntimePort {
	// ---- the nine P1 members (SPEC-CC-001) — UNCHANGED ----
	readonly providerId: ProviderId;
	prepareTurn(request: ChatTurnRequest): PreparedChatTurn;
	ensureReady(options?: ChatRuntimeEnsureReadyOptions): Promise<boolean>;
	query(
		turn: PreparedChatTurn,
		conversationHistory?: ChatMessage[],
		queryOptions?: ChatRuntimeQueryOptions,
	): AsyncGenerator<StreamChunk>;
	cancel(): void;
	getSessionId(): string | null;
	resetSession(): void;
	onReadyStateChange(listener: (ready: boolean) => void): Unsubscriber;
	isReady(): boolean;
	// ---- P3 additive (SPEC-TS-003, ADR-TS-002 §3) ----
	/** Bind this runtime to an existing session so the next turn continues it (REQ-TS-013, resume). */
	resumeSession(sessionId: string): void;
	/** Set the conversation-only rewind checkpoint; the next turn continues from this turn id (REQ-TS-021). */
	setResumeCheckpoint(assistantMessageId: string): void;
	/** The provider's fork/rewind capability flags — gates the UI affordances (REQ-TS-016/019). */
	getCapabilities(): RuntimeCapabilities;
	// ---- P4 additive (SPEC-CP-002, ADR-CP-004 §1) ----
	// The UI→runtime control channel for inline blocks: the runtime pulls (invokes
	// the registered callback) when it owns the timing; the UI registers HOW to
	// answer. The returned promise resolves the user's decision, or `null` for
	// cancel (Escape). `void`-returning, non-streaming — they do NOT change the
	// streaming-error convention (ADR-CC-001 §1, unchanged). No `respond(...)`
	// method (ADR-CP-004 §1, Opt B rejected). The setters are always registered
	// (the channel exists); `supportsInlineResponse` gates the answerable affordance.
	setAskUserQuestionCallback(
		cb: (req: AskUserQuestionRequest) => Promise<AskUserQuestionAnswer | null>,
	): void;
	setExitPlanModeCallback(
		cb: (req: ExitPlanModeRequest) => Promise<ExitPlanModeDecision | null>,
	): void;
	setApprovalCallback(cb: (req: ApprovalRequest) => Promise<ApprovalDecision | null>): void;
}
