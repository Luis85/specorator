/**
 * DTO produced by `TurnInputBuilder.build()` and consumed by
 * `ChatTurnOrchestrator.sendTurn()` (Arch #1, Arch #9).
 *
 * Snapshots everything the orchestrator needs about *one* user turn — the
 * builder reads from the four chat stores + vault + settings; the orchestrator
 * never touches those sources directly. This decoupling lets us unit-test the
 * orchestrator with plain DTO inputs and a `MockClaudeCliPort`, without
 * mounting a Vue component.
 *
 * Plain data only (ADR-003 Pinia DTO discipline): no class instances, no
 * functions, no Vue refs.
 */
import type { SessionId } from '@/domain/chat/SessionId';
import type { TransportKind } from '@/domain/chat/TransportKind';

/**
 * Discriminator that splits the orchestrator's dispatch table. The builder
 * decides which branch this turn takes — the orchestrator only switches on
 * the tag.
 *
 *   - `'free-text'` — the regular `queryStream()` path. Streams text deltas
 *     into `streamingTurnStore`; terminates with a single assistant message.
 *   - `'structured'` — the `/create` / `/create-file` slash command. Runs
 *     `queryStructured()` and produces a `FileWriteProposal` (UX-#5 dictates
 *     the assistant message body stays empty — only the proposal card is
 *     rendered).
 */
export type TurnIntent = 'free-text' | 'structured';

/**
 * Resolved transport for this turn — derived from the optional reactive
 * `TRANSPORT_KIND_KEY` ref the plugin injects, NOT from the raw
 * `settings.transportKind`. Under `transportKind === 'auto'` the selector
 * resolves to either subscription or api-key depending on availability;
 * recording the raw setting value here would pollute audit logs and resume
 * metadata (Codex P2, PR #350). Inherits the resolved value.
 */
export type ResolvedTransport = 'api-key' | 'subscription';

/**
 * Captured snapshot of the thread resolution for this turn. The builder
 * inspects the current `chatThreadsStore` state and decides whether the
 * orchestrator should *rotate* (mint a new thread record) or *reuse* the
 * active one.
 *
 *   - `'rotate'`  — transport or feature slug no longer matches the active
 *     thread; orchestrator mints a fresh `ChatThreadRecord`, evicts the
 *     previous thread's UI-only message/proposal buckets.
 *   - `'reuse'`   — transport + feature match; orchestrator keeps the existing
 *     thread id and forwards its captured session id as `resumeSessionId`.
 */
export interface ThreadRotationDecision {
	readonly kind: 'rotate' | 'reuse';
	/**
	 * The thread id that was active when the builder ran. `null` when no
	 * thread has been opened yet (first send of a session). On `'rotate'` the
	 * orchestrator uses this to evict the *previous* thread's buckets — never
	 * to identify the new thread (which it mints fresh).
	 */
	readonly previousThreadId: string | null;
	/**
	 * Only set when `kind === 'reuse'`. The resume session id the orchestrator
	 * forwards to `queryStream`/`queryStructured` so the subscription transport
	 * can pick up the existing conversation (REQ-ASM-035).
	 */
	readonly reuseThreadId?: string;
	readonly reuseSessionId?: SessionId;
}

/**
 * The single DTO consumed by `ChatTurnOrchestrator.sendTurn()`.
 *
 * Read it as a sealed envelope: every field needed to execute the turn is
 * resolved here. The orchestrator never re-reads vault / stores / settings to
 * compute these values — that's the builder's job, and the separation is what
 * makes the orchestrator unit-testable without Vue.
 */
export interface TurnInput {
	/** Raw user text snapshotted from the textarea before `beginRequest()`. */
	readonly userMessage: string;
	/** Fully assembled prompt string (user text + context-file preamble). */
	readonly prompt: string;
	/** True when `buildPrompt` had to trim context to stay within the cap. */
	readonly truncated: boolean;
	/** Stage-aware system-prompt suffix; empty string when no active feature. */
	readonly systemPromptSuffix: string;
	/** Active feature slug at send time, or `null`. Drives audit + resume. */
	readonly slug: string | null;
	/** Resolved transport for this turn. */
	readonly transport: ResolvedTransport;
	/** Structured-vs-freetext dispatch. */
	readonly intent: TurnIntent;
	/** Thread rotation decision; see {@link ThreadRotationDecision}. */
	readonly thread: ThreadRotationDecision;
	/**
	 * Transport hint for the (future) `selectTransport` dispatcher. Not used
	 * by the orchestrator today — kept on the DTO so it survives the builder
	 * snapshot for downstream telemetry and observability.
	 */
	readonly transportKindRaw: TransportKind;

	/**
	 * WS-8 (REQ-MPS-036/037): plan-mode hint forwarded to
	 * `ChatTransportStreamOptions.planMode`. The CLI adapter translates this
	 * to `--permission-mode plan` (REQ-MPS-037).
	 */
	readonly planMode?: boolean;

	/**
	 * WS-8 (REQ-MPS-039): body of a `#`-prefixed draft. The orchestrator
	 * appends this to `systemPromptSuffix` so the model treats it as a system
	 * instruction for this turn only.
	 */
	readonly instructionSuffix?: string;

	/**
	 * WS-8 (REQ-MPS-040): per-provider selected model id. Forwarded as
	 * `ChatTransportStreamOptions.model`.
	 */
	readonly model?: string;

	/**
	 * WS-8 (REQ-MPS-042/043): pending attachments for this turn. Forwarded as
	 * `ChatTransportStreamOptions.attachments`.
	 */
	readonly attachments?: ReadonlyArray<import('@/domain/ports/ChatTransportPort').ChatTransportAttachment>;
}
