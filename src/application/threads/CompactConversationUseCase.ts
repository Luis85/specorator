import type { Result } from '@/domain/shared/Result';
import type { ChatMessage } from '@/domain/ports';
import type {
	RunChatTurnUseCase,
	ChatTurnSink,
	ChatTurnError,
} from '@/application/chat/RunChatTurnUseCase';

/** The compact command the runtime maps to a `{ isCompact: true }` prepared turn. */
const COMPACT_COMMAND = '/compact';

/**
 * Compact the active conversation (SPEC-TS-015, REQ-TS-023). **Reuses the P2
 * machinery — NO new render path.** Delegates entirely to the existing
 * `RunChatTurnUseCase.run`: the runtime streams a `{type:'context_compacted'}`
 * `StreamChunk` (SPEC-CC-002) which the existing `RunChatTurnUseCase.dispatchChunk`
 * routes to `sink.onContextCompacted()` (carried from SPEC-RR-020) → the P2
 * `ContextCompactedBlock`. The conversation continues from the compacted state.
 * `Result`-returning (ADR-004); the discrete start-failure/throw outcomes are the
 * P1 `ChatTurnError`s; no `providerId` branch (REQ-TS-026).
 */
export class CompactConversationUseCase {
	constructor(private readonly runChatTurn: RunChatTurnUseCase) {}

	execute(history: ChatMessage[], sink: ChatTurnSink): Promise<Result<void, ChatTurnError>> {
		return this.runChatTurn.run({ request: { text: COMPACT_COMMAND }, history }, sink);
	}
}
