import { describe, it, expect } from 'vitest';
import { MockHistoryStore } from '@/infrastructure/mock/MockHistoryStore';
import { ListConversationsUseCase } from '@/application/threads/ListConversationsUseCase';
import type { ConversationRecord } from '@/domain/chat/ConversationRecord';

/**
 * TEST-TS-011 (use-case U leg) — `ListConversationsUseCase` (SPEC-TS-011,
 * REQ-TS-010). Forwards `history.listSessions()` (already sorted updatedAt DESC);
 * an empty store → ok([]) (load-or-default, NFR-TS-014). Result-returning.
 */
function record(id: string, updatedAt: number): ConversationRecord {
	return {
		version: 1,
		meta: {
			id,
			title: `t:${id}`,
			titleManual: false,
			createdAt: 1,
			updatedAt,
			providerId: 'claude',
			sessionId: null,
		},
		messages: [],
		providerState: {},
	};
}

describe('TEST-TS-011 ListConversationsUseCase', () => {
	it('returns the meta array sorted updatedAt DESC', async () => {
		const store = new MockHistoryStore([
			record('a', 100),
			record('b', 300),
			record('c', 200),
		]);
		const result = await new ListConversationsUseCase(store).execute();
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.map((m) => m.id)).toEqual(['b', 'c', 'a']);
	});

	it('returns ok([]) for an empty store', async () => {
		const result = await new ListConversationsUseCase(new MockHistoryStore()).execute();
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toEqual([]);
	});
});
