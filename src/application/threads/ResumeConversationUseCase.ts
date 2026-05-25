import { ok, type Result } from '@/domain/shared/Result';
import type { ProviderHistoryPort, ChatMessage } from '@/domain/ports';

/**
 * The tab payload a resume produces (SPEC-TS-012). The caller (`tabsStore`) loads
 * it into a tab and, when `sessionId !== null`, binds the runtime via
 * `resumeSession`; the transcript renders through the existing P2 block path
 * (collapsibles collapsed by default — REQ-TS-014, no P2 rework).
 */
export interface ResumeResult {
	conversationId: string;
	title: string;
	messages: ChatMessage[];
	sessionId: string | null;
}

/**
 * Resume a persisted conversation (SPEC-TS-012, REQ-TS-013/014). Hydrates the
 * record, then resolves its resumable session id. A missing/corrupt record
 * (EC-TS-5/6) → `err` carrying a UI-safe message — the caller treats it as a
 * quiet no-op + notice, never a throw (load-or-default). The runtime bind is the
 * caller's; this use case has no side effects. `Result`-returning (ADR-004), no
 * `providerId` branch (REQ-TS-026).
 */
export class ResumeConversationUseCase {
	constructor(private readonly history: ProviderHistoryPort) {}

	async execute(conversationId: string): Promise<Result<ResumeResult>> {
		const hydrated = await this.history.hydrate(conversationId);
		if (!hydrated.ok) return hydrated;

		const resolved = await this.history.resolveSessionId(conversationId);
		if (!resolved.ok) return resolved;

		const record = hydrated.value;
		return ok({
			conversationId,
			title: record.meta.title,
			messages: record.messages,
			sessionId: resolved.value,
		});
	}
}
