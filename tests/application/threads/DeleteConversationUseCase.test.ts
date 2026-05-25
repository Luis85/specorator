import { describe, it, expect } from 'vitest';
import { MockHistoryStore } from '@/infrastructure/mock/MockHistoryStore';
import { DeleteConversationUseCase } from '@/application/threads/DeleteConversationUseCase';
import type { ConversationRecord } from '@/domain/chat/ConversationRecord';

/**
 * TEST-TS-012 (delete U leg) — `DeleteConversationUseCase` (SPEC-TS-017,
 * REQ-TS-012, EC-TS-12). delete(id) idempotent on a missing id. Result-returning.
 */
function record(id: string): ConversationRecord {
	return {
		version: 1,
		meta: {
			id,
			title: 't',
			titleManual: false,
			createdAt: 1,
			updatedAt: 2,
			providerId: 'claude',
			sessionId: null,
		},
		messages: [],
		providerState: {},
	};
}

describe('TEST-TS-012 DeleteConversationUseCase', () => {
	it('removes the record', async () => {
		const store = new MockHistoryStore([record('c1')]);
		const result = await new DeleteConversationUseCase(store).execute('c1');
		expect(result.ok).toBe(true);
		expect(store.getAllConversations()).toEqual([]);
	});

	it('is idempotent on a missing id', async () => {
		const result = await new DeleteConversationUseCase(new MockHistoryStore()).execute('absent');
		expect(result.ok).toBe(true);
	});
});
