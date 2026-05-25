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

/**
 * Provider capability flags (SPEC-TS-003) — gate the fork/rewind UI affordances.
 * Read through the port, NEVER branched on by `providerId` (REQ-TS-026).
 */
export interface RuntimeCapabilities {
	readonly supportsFork: boolean;
	readonly supportsRewind: boolean;
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
}
