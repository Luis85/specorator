import { ok, err, type Result } from '@/domain/shared/Result';
import { HistoryError, type ProviderHistoryPort } from '@/domain/ports/ProviderHistoryPort';
import type { ProviderId } from '@/domain/chat/ProviderId';
import type {
	ConversationRecord,
	ConversationMeta,
	ForkPlan,
	ClaudeProviderState,
} from '@/domain/chat/ConversationRecord';
import { buildForkPlan } from '@/infrastructure/history/buildForkPlan';

/**
 * In-memory `ProviderHistoryPort` over a `Map<string, ConversationRecord>`
 * (SPEC-TS-007). No vault — `npm run dev` + unit tests exercise every path. The
 * `seedConversations`/`getAllConversations` helpers mirror the existing
 * `MockBridge` accessors. Read paths load-or-default (empty -> ok([]),
 * resolveSessionId -> ok(null)); `delete` is idempotent; `updateMeta` patches the
 * meta only (EC-TS-14); `buildForkPlan` delegates to the pure helper (EC-TS-7).
 */
export class MockHistoryStore implements ProviderHistoryPort {
	readonly providerId: ProviderId = 'claude';

	private readonly records = new Map<string, ConversationRecord>();

	constructor(seed: readonly ConversationRecord[] = []) {
		for (const record of seed) this.records.set(record.meta.id, clone(record));
	}

	listSessions(): Promise<Result<ConversationMeta[]>> {
		const metas = [...this.records.values()]
			.map((r) => r.meta)
			.sort((a, b) => b.updatedAt - a.updatedAt);
		return Promise.resolve(ok(metas.map((m) => ({ ...m }))));
	}

	hydrate(conversationId: string): Promise<Result<ConversationRecord>> {
		const record = this.records.get(conversationId);
		if (record === undefined) {
			return Promise.resolve(
				err(new HistoryError('not-found', `conversation not found: ${conversationId}`)),
			);
		}
		return Promise.resolve(ok(clone(record)));
	}

	save(record: ConversationRecord): Promise<Result<void>> {
		this.records.set(record.meta.id, clone(record));
		return Promise.resolve(ok(undefined));
	}

	updateMeta(conversationId: string, patch: Partial<ConversationMeta>): Promise<Result<void>> {
		const record = this.records.get(conversationId);
		if (record === undefined) {
			return Promise.resolve(
				err(new HistoryError('not-found', `conversation not found: ${conversationId}`)),
			);
		}
		// Patch meta only — messages/providerState/version untouched (EC-TS-14).
		const next: ConversationRecord = {
			...record,
			meta: { ...record.meta, ...patch, id: record.meta.id },
		};
		this.records.set(conversationId, next);
		return Promise.resolve(ok(undefined));
	}

	delete(conversationId: string): Promise<Result<void>> {
		// Idempotent — deleting a missing id -> ok.
		this.records.delete(conversationId);
		return Promise.resolve(ok(undefined));
	}

	resolveSessionId(conversationId: string): Promise<Result<string | null>> {
		const record = this.records.get(conversationId);
		if (record === undefined) return Promise.resolve(ok(null));
		const state = record.providerState as ClaudeProviderState;
		const resolved = record.meta.sessionId ?? state.forkSource?.sessionId ?? null;
		return Promise.resolve(ok(resolved));
	}

	buildForkPlan(
		sourceConversationId: string,
		resumeAtMessageId: string,
	): Promise<Result<ForkPlan>> {
		const source = this.records.get(sourceConversationId);
		if (source === undefined) {
			return Promise.resolve(
				err(new HistoryError('not-found', `conversation not found: ${sourceConversationId}`)),
			);
		}
		return Promise.resolve(buildForkPlan(source, resumeAtMessageId));
	}

	// ── Test / dev helpers (parity with the MockBridge accessors) ───────────────

	seedConversations(records: readonly ConversationRecord[]): void {
		for (const record of records) this.records.set(record.meta.id, clone(record));
	}

	getAllConversations(): ConversationRecord[] {
		return [...this.records.values()].map(clone);
	}
}

/** Defensive structural copy so callers never mutate the stored record in place. */
function clone(record: ConversationRecord): ConversationRecord {
	return {
		version: record.version,
		meta: { ...record.meta },
		messages: record.messages.map((m) => ({ ...m })),
		providerState: { ...record.providerState },
	};
}
