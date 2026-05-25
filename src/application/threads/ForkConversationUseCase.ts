import type { Result } from '@/domain/shared/Result';
import type { ProviderHistoryPort, ForkPlan } from '@/domain/ports';

/**
 * Fork a conversation at a chosen message (SPEC-TS-013, REQ-TS-018). Forwards
 * `history.buildForkPlan(srcId, resumeAtMessageId)` — the store derives the plan
 * (transcript truncated through the chosen message + a fresh `forkSource`
 * providerState bag, NOT a copy) and never mutates the source record (EC-TS-7).
 * The caller (`tabsStore`) opens the plan into the chosen `ForkTarget`
 * (SPEC-TS-031). Source missing/corrupt or `resumeAtMessageId` absent → `err`.
 * Pure orchestration; `Result`-returning (ADR-004); no `providerId` branch
 * (REQ-TS-026).
 */
export class ForkConversationUseCase {
	constructor(private readonly history: ProviderHistoryPort) {}

	execute(sourceConversationId: string, resumeAtMessageId: string): Promise<Result<ForkPlan>> {
		return this.history.buildForkPlan(sourceConversationId, resumeAtMessageId);
	}
}
