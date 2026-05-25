import type { Result } from '@/domain/shared/Result';
import type { ProviderHistoryPort, ConversationMeta } from '@/domain/ports';

/**
 * List the persisted conversations (SPEC-TS-011, REQ-TS-010). Forwards
 * `history.listSessions()` (already sorted `updatedAt` DESC); an empty store →
 * `ok([])` (load-or-default, NFR-TS-014). The use case holds no UI state and
 * never branches on `providerId` (REQ-TS-026). `Result`-returning (ADR-004).
 */
export class ListConversationsUseCase {
	constructor(private readonly history: ProviderHistoryPort) {}

	execute(): Promise<Result<ConversationMeta[]>> {
		return this.history.listSessions();
	}
}
