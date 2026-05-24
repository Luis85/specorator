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
 * The P1 streaming + lifecycle subset of Claudian's ChatRuntime (`ChatRuntime.ts:20`),
 * blessed by ADR-CC-001. EXACTLY nine members. The tool/approval/plan callback setters
 * (`ChatRuntime.ts:48-54`), `rewind` (:47), `steer` (:38), subagent hooks,
 * `getCapabilities`/`getSupportedCommands` are DEFERRED to P2–P4/P9 and grow additively.
 * Do NOT add them in P1.
 *
 * Error convention (ADR-CC-001 §1): `query` streams; **expected streaming failure is the
 * `{type:'error';content}` `StreamChunk` member, not a thrown error / `Result`**. The
 * non-streaming lifecycle methods return their natural type (`ensureReady → Promise<boolean>`).
 */
export interface ChatRuntimePort {
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
}
