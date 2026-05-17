/**
 * `ChatTurnOrchestrator` — single owner of one chat turn end-to-end
 * (Arch review #1, deepening the WP-3 chat-store split).
 *
 * Before this refactor `ChatSidebar.handleSend` was a 120-LOC method that
 * threaded thread rotation, transport-routed dispatch, stream consumption,
 * proposal handling, success/error mutation, and vault-mirror scheduling
 * through a Vue component. That made every piece unreachable from a unit
 * test without mounting the component, and Codex P2 fixes piled up against
 * the component file precisely because of it.
 *
 * The orchestrator's contract:
 *   - **One method:** `sendTurn(input: TurnInput): Promise<Result<TurnOutcome,
 *     ChatTurnError>>`.
 *   - **Never throws.** All failures surface through `Result.error`.
 *   - **Pure dispatch.** Reads nothing from vault / settings / stores directly —
 *     the {@link TurnInput} DTO carries every input; the orchestrator only
 *     mutates the four chat stores via their existing actions.
 *
 * Pure application layer (ADR-001 / ADR-008): no `obsidian` imports, no Vue,
 * no Pinia internals beyond the structural store shapes injected via the
 * constructor.
 */
import { err, ok, type Result } from '@/domain/shared/Result';
import type {
	ClaudeCliErrorCode,
	ClaudeCliPort,
} from '@/domain/ports/ClaudeCliPort';
import { consumeStream } from './consumeStream';
import type { SessionId } from '@/domain/chat/SessionId';
import type { ChatThreadRecord } from '@/domain/chat/ChatThreadRecord';
import type { LoggerPort } from '@/domain/ports/LoggerPort';
import { queryStructured, type StructuredCliCallOptions } from '@/application/chat/queryStructured';
import { proposeFileWrite } from '@/application/chat/proposeFileWrite';
import { validateProposalPath } from '@/application/chat/validateProposalPath';
import type { FileWriteProposal } from '@/application/chat/FileWriteProposal';
import type { CreateFileEnvelope } from '@/application/chat/createFileEnvelopeSchema';
import { EnvelopeParseError, type PathValidationError } from '@/application/chat/errors';
import type { ClaudeCliError } from '@/domain/ports/ClaudeCliPort';
import type { SettingsPort } from '@/domain/ports/SettingsPort';
import type { VaultPort } from '@/domain/ports/VaultPort';
import type { SessionLogWriter } from '@/application/chat/SessionLogWriter';
import { ChatTurnError } from './ChatTurnError';
import type { TurnInput } from './TurnInput';

/**
 * Structural view of the messages store the orchestrator mutates. Kept as a
 * narrow interface (not the Pinia store return type) so the orchestrator
 * stays Vue-free and unit tests pass plain fakes.
 */
export interface MessagesPort {
	beginRequest(): void;
	setResponse(text: string, truncated: boolean): void;
	setError(type: 'timeout' | 'query_failed'): void;
	setUserText(text: string): void;
	setStructuredFail(value: boolean): void;
	appendMessage(message: {
		readonly id: string;
		readonly threadId: string;
		readonly role: 'user' | 'assistant';
		readonly text: string;
		readonly createdAt: string;
		readonly truncated?: boolean;
	}): void;
	clearThreadMessages(threadId: string): void;
	appendCompactBoundaryNotice(threadId: string, payload: { reason?: string }): void;
}

/** Structural view of the chat-threads store. */
export interface ThreadsPort {
	readonly chatThreads: ReadonlyMap<string, ChatThreadRecord>;
	upsertThread(record: ChatThreadRecord): void;
	setActiveThreadId(threadId: string | null): void;
	captureSessionId(threadId: string, sessionId: SessionId): void;
	markThreadUsed(threadId: string): void;
}

/** Structural view of the per-turn streaming store. */
export interface StreamingPort {
	resetStreaming(): void;
	setCliStartingUp(value: boolean): void;
	setSessionResumed(value: boolean): void;
	appendStreamingDelta(delta: string): void;
	appendStreamingThinking(delta: string): void;
	startStreamingToolCall(blockId: string, toolName: string, initialJson: string): void;
	appendStreamingToolCallInput(blockId: string, partialJson: string): void;
	finishStreamingToolCall(blockId: string): void;
	setLastUsage(usage: { inputTokens: number; outputTokens: number }): void;
}

/** Structural view of the proposal store. */
export interface ProposalsPort {
	addProposal(proposal: FileWriteProposal): void;
	clearThreadProposals(threadId: string): void;
}

/**
 * Constructor dependencies. Each store-shaped dependency is passed as a
 * **getter** so the orchestrator can be constructed once and stay live across
 * Pinia reactivity changes (the actual store reference doesn't move, but
 * passing the function keeps the seam testable without Pinia).
 *
 * `nowIso` and `randomId` are injected so tests get deterministic output.
 * `abortControllerFactory` lets tests stub the controller; production
 * defaults to `new AbortController()`.
 */
export interface ChatTurnOrchestratorDeps {
	readonly claudeCliPort: ClaudeCliPort | undefined;
	readonly settings: SettingsPort;
	readonly vault: VaultPort;
	readonly logger: LoggerPort;
	readonly messages: MessagesPort;
	readonly threads: ThreadsPort;
	readonly streaming: StreamingPort;
	readonly proposals: ProposalsPort;
	readonly getSessionLogWriter: () => Promise<SessionLogWriter>;
	readonly nowIso: () => string;
	readonly randomId: () => string;
	readonly abortControllerFactory: () => AbortController;
}

/**
 * Successful turn outcome. The UI binds these to the existing
 * focus/refocus/clear-input affordances. `kind: 'error'` is delivered through
 * the same `Result.ok({ kind: 'error' })` shape because the existing failure
 * mode is observable through store mutations (`messagesStore.setError`) —
 * surfacing a second error channel via `Result.error` would be doubly-named.
 *
 * `ChatTurnError` is reserved for orchestrator-level failures that cannot
 * even reach the dispatch (e.g. `cli-unavailable` when the port was not
 * injected at all — distinct from the SDK returning `NOT_INSTALLED`).
 */
export type TurnOutcome =
	| { readonly kind: 'success'; readonly threadId: string; readonly abortHandle: AbortController }
	| {
			readonly kind: 'structured-success';
			readonly threadId: string;
			readonly proposal: FileWriteProposal;
	  }
	| { readonly kind: 'structured-parse-fail'; readonly threadId: string }
	| { readonly kind: 'transport-error'; readonly threadId: string; readonly code: ClaudeCliErrorCode };

export class ChatTurnOrchestrator {
	constructor(private readonly deps: ChatTurnOrchestratorDeps) {}

	/**
	 * The orchestrator's single entry point. Mutates the four chat stores to
	 * carry out one user turn. Never throws.
	 *
	 * The caller's job after this returns is purely UI: focus the textarea,
	 * surface a notification on terminal failure, clear input. Everything else
	 * has already happened against the stores.
	 */
	/**
	 * The orchestrator's single entry point. Mutates the four chat stores to
	 * carry out one user turn. Never throws.
	 *
	 * @param options.onAbortController Fires once with the `AbortController`
	 *   that drives the streaming turn, the moment it is created — before any
	 *   delta arrives. The UI plugs the controller into its "Stop generation"
	 *   button so the user can cancel mid-stream. Not invoked on the
	 *   structured path (no cancellation affordance there).
	 */
	async sendTurn(
		input: TurnInput,
		options: {
			readonly onAbortController?: (controller: AbortController) => void;
		} = {},
	): Promise<Result<TurnOutcome, ChatTurnError>> {
		// Clear structured-fail flag at every new send (UX-#5 closes the empty-
		// bubble loop independently — see `applySuccessfulTurn` below for the
		// proposal-only skip).
		this.deps.messages.setStructuredFail(false);
		// Reset streaming BEFORE the structured/free-text branch split so every
		// new send starts from empty streaming state (Codex P2 on PR #372).
		this.deps.streaming.resetStreaming();
		this.deps.messages.beginRequest();

		if (this.deps.claudeCliPort === undefined) {
			this.deps.messages.setError('query_failed');
			return err(new ChatTurnError('cli-unavailable'));
		}
		const port = this.deps.claudeCliPort;

		const threadId = this.resolveThreadId(input);
		const onSessionId = (id: SessionId): void => {
			this.deps.threads.captureSessionId(threadId, id);
		};
		const resumeSessionId = input.thread.kind === 'reuse' ? input.thread.reuseSessionId : undefined;
		const isResumedTurn = resumeSessionId !== undefined;

		if (input.intent === 'structured') {
			const outcome = await this.dispatchStructured(port, input, threadId, {
				resumeSessionId,
				isResumedTurn,
				onSessionId,
			});
			return ok(outcome);
		}
		return ok(
			await this.dispatchFreeText(port, input, threadId, {
				resumeSessionId,
				isResumedTurn,
				onSessionId,
				onAbortController: options.onAbortController,
			}),
		);
	}

	// ── Thread rotation ────────────────────────────────────────────────────

	private resolveThreadId(input: TurnInput): string {
		if (input.thread.kind === 'reuse' && input.thread.reuseThreadId !== undefined) {
			return input.thread.reuseThreadId;
		}
		return this.mintRotatedThread(input);
	}

	/**
	 * Mint a fresh thread record for this turn and evict the previous thread's
	 * in-memory message AND proposal buckets (Codex P2 on PR #369). The
	 * `ChatThreadRecord` for the previous thread is preserved in `chatThreads`
	 * (a future thread-switcher UI can still resume its session id), but the
	 * UI-only buckets would otherwise accumulate unreachably.
	 */
	private mintRotatedThread(input: TurnInput): string {
		const threadId = this.deps.randomId();
		const nowIso = this.deps.nowIso();
		const fresh: ChatThreadRecord = {
			threadId,
			sessionId: null,
			feature: input.slug,
			logPath: '',
			transport: input.transport,
			createdAt: nowIso,
			lastUsedAt: nowIso,
		};
		this.deps.threads.upsertThread(fresh);
		this.deps.threads.setActiveThreadId(threadId);
		const prev = input.thread.previousThreadId;
		if (prev !== null && prev !== threadId) {
			this.deps.messages.clearThreadMessages(prev);
			this.deps.proposals.clearThreadProposals(prev);
		}
		return threadId;
	}

	// ── Free-text streaming branch ────────────────────────────────────────

	private async dispatchFreeText(
		port: ClaudeCliPort,
		input: TurnInput,
		threadId: string,
		ctx: {
			resumeSessionId: SessionId | undefined;
			isResumedTurn: boolean;
			onSessionId: (id: SessionId) => void;
			onAbortController?: (controller: AbortController) => void;
		},
	): Promise<TurnOutcome> {
		this.deps.streaming.setCliStartingUp(true);
		const abortController = this.deps.abortControllerFactory();
		ctx.onAbortController?.(abortController);
		const streamResult = await consumeStream({
			stream: port.queryStream(input.prompt, {
				timeoutMs: 30_000,
				systemPromptSuffix: input.systemPromptSuffix,
				resumeSessionId: ctx.resumeSessionId,
				onSessionId: ctx.onSessionId,
				signal: abortController.signal,
			}),
			threadId,
			messages: this.deps.messages,
			threads: this.deps.threads,
			streaming: this.deps.streaming,
		});
		this.deps.streaming.setCliStartingUp(false);

		if (streamResult.kind === 'success') {
			this.applySuccessfulTurn({
				threadId,
				isResumedTurn: ctx.isResumedTurn,
				userMessage: input.userMessage,
				assistantResponse: streamResult.text,
				truncated: input.truncated,
				hasProposal: false,
			});
			return { kind: 'success', threadId, abortHandle: abortController };
		}
		this.deps.messages.setError(streamResult.errorCode === 'TIMEOUT' ? 'timeout' : 'query_failed');
		return { kind: 'transport-error', threadId, code: streamResult.errorCode };
	}

	// ── Structured branch ─────────────────────────────────────────────────

	private async dispatchStructured(
		port: ClaudeCliPort,
		input: TurnInput,
		threadId: string,
		ctx: {
			resumeSessionId: SessionId | undefined;
			isResumedTurn: boolean;
			onSessionId: (id: SessionId) => void;
		},
	): Promise<TurnOutcome> {
		const options: StructuredCliCallOptions = {
			timeoutMs: 30_000,
			systemPromptSuffix: input.systemPromptSuffix,
			resumeSessionId: ctx.resumeSessionId,
			onSessionId: ctx.onSessionId,
		};
		this.deps.streaming.setCliStartingUp(true);
		const structuredResult = await queryStructured(port, input.prompt, options);
		this.deps.streaming.setCliStartingUp(false);

		if (!structuredResult.ok) {
			return this.handleStructuredFailure(structuredResult.error, threadId);
		}
		const envelope = structuredResult.value;
		const proposal = await this.addProposalFromEnvelope(envelope, threadId, input.userMessage);
		// UX-#5: structured turns produce a proposal card, not an assistant
		// message body. `applySuccessfulTurn` with `hasProposal: true` skips
		// the empty `appendMessage` so the agent panel doesn't render an
		// empty "(No text — see the proposal card below.)" bubble next to
		// the rendered card.
		this.applySuccessfulTurn({
			threadId,
			isResumedTurn: ctx.isResumedTurn,
			userMessage: input.userMessage,
			assistantResponse: '',
			truncated: input.truncated,
			hasProposal: true,
		});
		return { kind: 'structured-success', threadId, proposal };
	}

	private handleStructuredFailure(
		error: EnvelopeParseError | ClaudeCliError,
		threadId: string,
	): TurnOutcome {
		if (error instanceof EnvelopeParseError) {
			this.deps.messages.setStructuredFail(true);
			this.deps.messages.setResponse('', false);
			return { kind: 'structured-parse-fail', threadId };
		}
		const code = error.errorCode;
		this.deps.messages.setError(code === 'TIMEOUT' ? 'timeout' : 'query_failed');
		return { kind: 'transport-error', threadId, code };
	}

	private async addProposalFromEnvelope(
		envelope: CreateFileEnvelope,
		threadId: string,
		originPrompt: string,
	): Promise<FileWriteProposal> {
		// Read-only preview (REQ-ASM-041). Failure is non-fatal: we still
		// surface the proposal so the user can decide.
		const previewResult = await proposeFileWrite(envelope, this.deps.vault);
		if (!previewResult.ok) {
			this.deps.logger.warn('proposeFileWrite failed; rendering proposal without preview', {
				path: envelope.path,
				reason: previewResult.error.message,
			});
		}
		// Defence-in-depth path validation (REQ-ASM-048). On failure the
		// proposal is still recorded so the user sees the rejection in-context,
		// but with a `failureReason` of `WRITE_FAILED` once the Accept path
		// runs. The path-error map for the card is owned by ChatSidebar — the
		// orchestrator only seeds the proposal record.
		const settings = await this.deps.settings.getSettings();
		const validationResult = validateProposalPath(envelope, settings.specsFolder);
		const proposalId = this.deps.randomId();
		const proposal: FileWriteProposal = {
			proposalId,
			threadId,
			envelope,
			status: 'pending',
			proposedAt: this.deps.nowIso(),
			decidedAt: null,
			failureReason: null,
			originPrompt,
		};
		this.deps.proposals.addProposal(proposal);
		this.pathErrors.set(proposalId, validationResult.ok ? null : validationResult.error);
		return proposal;
	}

	/**
	 * Per-proposal path-validation errors recorded during `addProposalFromEnvelope`.
	 * The component reads `consumePathError(proposalId)` once after the
	 * orchestrator settles so it can hand the error to the
	 * `FileWriteProposalCard`. The map keeps memory bounded to proposals
	 * created by THIS orchestrator instance.
	 */
	private readonly pathErrors = new Map<string, PathValidationError | null>();

	/**
	 * Drain the per-turn path-validation slot for one proposal. Returns
	 * `null` when no error was recorded. Idempotent: subsequent reads return
	 * `null` so a re-emission doesn't leak stale state.
	 */
	consumePathError(proposalId: string): PathValidationError | null {
		const entry = this.pathErrors.get(proposalId);
		this.pathErrors.delete(proposalId);
		return entry ?? null;
	}

	// ── Success mutation + vault mirror ───────────────────────────────────

	private applySuccessfulTurn(args: {
		threadId: string;
		isResumedTurn: boolean;
		userMessage: string;
		assistantResponse: string;
		truncated: boolean;
		hasProposal: boolean;
	}): void {
		this.deps.messages.setResponse(args.assistantResponse, args.truncated);
		this.deps.messages.setUserText('');
		this.deps.threads.markThreadUsed(args.threadId);
		if (args.isResumedTurn) {
			this.deps.streaming.setSessionResumed(true);
		}
		const nowIso = this.deps.nowIso();
		this.deps.messages.appendMessage({
			id: this.deps.randomId(),
			threadId: args.threadId,
			role: 'user',
			text: args.userMessage,
			createdAt: nowIso,
		});
		// UX-#5: skip the empty assistant placeholder on proposal-only turns.
		// The proposal card IS the assistant rendering; appending an empty
		// `ChatMessage{role:'assistant'}` would produce the "(No text — see
		// the proposal card below.)" placeholder next to the actual card,
		// which is the bug reviewers flagged.
		if (!(args.hasProposal && args.assistantResponse === '')) {
			this.deps.messages.appendMessage({
				id: this.deps.randomId(),
				threadId: args.threadId,
				role: 'assistant',
				text: args.assistantResponse,
				createdAt: nowIso,
				truncated: args.truncated,
			});
		}
		this.mirrorTurnToVault({
			threadId: args.threadId,
			userMessage: args.userMessage,
			assistantResponse: args.assistantResponse,
		});
	}

	/**
	 * Fire-and-forget mirror of a successful turn to the vault (REQ-ASM-040).
	 * The writer silently drops the write when no `session_id` has been
	 * captured yet. All failures are routed to `logger.warn` so the chat-send
	 * path completes normally.
	 *
	 * NOTE for WP-5: today this awaits the writer factory + chains the warn
	 * handler inline. A `SessionLogMirror` facade (out of scope here) would
	 * collapse the two `.then`/`.catch` into a single best-effort call.
	 */
	private mirrorTurnToVault(args: {
		threadId: string;
		userMessage: string;
		assistantResponse: string;
	}): void {
		const thread = this.deps.threads.chatThreads.get(args.threadId);
		if (thread === undefined) return;
		void this.deps
			.getSessionLogWriter()
			.then((writer) =>
				writer.appendUserAssistant(thread, {
					user: args.userMessage,
					assistant: args.assistantResponse,
				}),
			)
			.catch((error: unknown) => {
				this.deps.logger.warn('SessionLogWriter.appendUserAssistant failed', {
					threadId: args.threadId,
					reason: error instanceof Error ? error.message : String(error),
				});
			});
	}

}
