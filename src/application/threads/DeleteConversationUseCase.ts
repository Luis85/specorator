import type { Result } from '@/domain/shared/Result';
import type { ProviderHistoryPort } from '@/domain/ports';

/**
 * Delete a conversation + its transcript (SPEC-TS-017, REQ-TS-012). Forwards
 * `history.delete(id)` — idempotent: deleting a missing id → `ok` (EC-TS-12). The
 * delete confirmation is the UI's (an Obsidian `Modal`, SPEC-TS-024), not this
 * use case's. `Result`-returning (ADR-004), no `providerId` branch (REQ-TS-026).
 */
export class DeleteConversationUseCase {
	constructor(private readonly history: ProviderHistoryPort) {}

	execute(conversationId: string): Promise<Result<void>> {
		return this.history.delete(conversationId);
	}
}
