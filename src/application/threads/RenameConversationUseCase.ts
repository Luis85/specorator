import type { Result } from '@/domain/shared/Result';
import type { ProviderHistoryPort } from '@/domain/ports';

/**
 * Rename a conversation (SPEC-TS-017, REQ-TS-011). Patches meta only via
 * `updateMeta(id, { title, titleManual: true, updatedAt })` — `titleManual: true`
 * is the manual-rename precedence that bars a later title-gen overwrite
 * (REQ-TS-024); `messages`/`providerState` are untouched (EC-TS-14). The store
 * patches in place; an unknown id → `err{not-found}`. `Result`-returning
 * (ADR-004), no `providerId` branch (REQ-TS-026).
 */
export class RenameConversationUseCase {
	constructor(private readonly history: ProviderHistoryPort) {}

	execute(conversationId: string, title: string): Promise<Result<void>> {
		return this.history.updateMeta(conversationId, {
			title,
			titleManual: true,
			updatedAt: Date.now(),
		});
	}
}
