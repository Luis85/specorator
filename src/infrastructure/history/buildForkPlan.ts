import { ok, err, type Result } from '@/domain/shared/Result';
import { HistoryError } from '@/domain/ports/ProviderHistoryPort';
import type {
	ConversationRecord,
	ForkPlan,
	ProviderSessionState,
	ClaudeProviderState,
} from '@/domain/chat/ConversationRecord';

/**
 * The pure fork-derive helper (SPEC-TS-006/013) used by every bridge's
 * `ProviderHistoryPort.buildForkPlan` so the truncate/derive logic is unit-tested
 * independent of the vault. Mirrors claudian-main `buildForkProviderState`.
 *
 * Truncates the source transcript **through** the message whose id is
 * `resumeAtMessageId` (inclusive); derives a fresh `{ forkSource: { sessionId,
 * resumeAt } }` providerState bag (NOT a transcript copy — REQ-TS-018); carries
 * the source title. The **source record is never mutated** (EC-TS-7). Pure/total:
 * an absent `resumeAtMessageId` → `err(HistoryError{not-found})`.
 */
export function buildForkPlan(
	source: ConversationRecord,
	resumeAtMessageId: string,
): Result<ForkPlan> {
	const cut = source.messages.findIndex((m) => m.id === resumeAtMessageId);
	if (cut === -1) {
		return err(
			new HistoryError(
				'not-found',
				`fork target message not found: ${resumeAtMessageId}`,
			),
		);
	}

	// Inclusive truncation — a fresh array, the source array is untouched.
	const messages = source.messages.slice(0, cut + 1);

	const sourceState = source.providerState as ClaudeProviderState;
	const sessionId = source.meta.sessionId ?? sourceState.providerSessionId ?? '';
	// Typed as the opaque ProviderSessionState bag (the ForkPlan contract); the
	// forkSource key is the documentary ClaudeProviderState shape.
	const providerState: ProviderSessionState = {
		forkSource: { sessionId, resumeAt: resumeAtMessageId },
	};

	return ok({
		messages,
		providerState,
		sourceTitle: source.meta.title,
	});
}
