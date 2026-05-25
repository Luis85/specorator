import type { Result } from '@/domain/shared/Result';
import type { ProviderId } from '@/domain/chat/ProviderId';
import type {
	ConversationRecord,
	ConversationMeta,
	ForkPlan,
} from '@/domain/chat/ConversationRecord';

/**
 * The provider-addressed conversation-history seam (ADR-TS-001). Mirrors
 * claudian-main's `ProviderConversationHistoryService`
 * (`core/providers/types.ts`); every discrete method is Result-returning
 * (ADR-004). Provided per mount via the bridge `createProviderHistoryPort()`
 * factory; its own `PROVIDER_HISTORY_PORT` InjectionKey + `useProviderHistoryPort()`
 * composable — NO aggregate (ADR-008, ADR-CC-001 §5). One impl is wired in P3 —
 * Claude (REQ-TS-027); application/UI NEVER branch on `providerId` (REQ-TS-026).
 *
 * Read paths load-or-default: an empty/missing store → `ok([])` /
 * `resolveSessionId → ok(null)`, never `err`. A missing/corrupt record on
 * `hydrate` → `err` carrying a typed {@link HistoryError}; the use cases map
 * that to a quiet no-op + notice, never a throw (SPEC-TS-011..017).
 */
export interface ProviderHistoryPort {
	readonly providerId: ProviderId;
	listSessions(): Promise<Result<ConversationMeta[]>>;
	hydrate(conversationId: string): Promise<Result<ConversationRecord>>;
	save(record: ConversationRecord): Promise<Result<void>>;
	updateMeta(conversationId: string, patch: Partial<ConversationMeta>): Promise<Result<void>>;
	delete(conversationId: string): Promise<Result<void>>;
	resolveSessionId(conversationId: string): Promise<Result<string | null>>;
	buildForkPlan(sourceConversationId: string, resumeAtMessageId: string): Promise<Result<ForkPlan>>;
}

/**
 * Typed error crossing the port in `Result.err` (SPEC-TS-001). The use cases
 * translate `kind` to UI-safe outcomes: `'not-found'`/`'corrupt'` → load-or-default
 * on read paths; `'io'` → a non-blocking notice on write paths.
 */
export class HistoryError extends Error {
	constructor(
		readonly kind: 'not-found' | 'corrupt' | 'io',
		message: string,
	) {
		super(message);
		this.name = 'HistoryError';
	}
}
