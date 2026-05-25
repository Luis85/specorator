import { describe, it, expect } from 'vitest';
import { MockHistoryStore } from '@/infrastructure/mock/MockHistoryStore';
import { ResumeConversationUseCase } from '@/application/threads/ResumeConversationUseCase';
import type { ConversationRecord } from '@/domain/chat/ConversationRecord';
import type { ChatMessage } from '@/domain/chat/ChatMessage';

/**
 * TEST-TS-013 (U leg) — `ResumeConversationUseCase` (SPEC-TS-012, REQ-TS-013/014,
 * EC-TS-5/6). hydrate + resolveSessionId → { conversationId, title, messages,
 * sessionId }; a missing/corrupt record → err (no throw, load-or-default).
 */
function record(id: string, sessionId: string | null, messages: ChatMessage[]): ConversationRecord {
	return {
		version: 1,
		meta: {
			id,
			title: `t:${id}`,
			titleManual: false,
			createdAt: 1,
			updatedAt: 2,
			providerId: 'claude',
			sessionId,
		},
		messages,
		providerState: {},
	};
}

describe('TEST-TS-013 ResumeConversationUseCase', () => {
	it('hydrates the transcript and resolves the session id', async () => {
		const messages: ChatMessage[] = [
			{ id: 'u1', role: 'user', content: 'hi', timestamp: 1 },
			{ id: 'a1', role: 'assistant', content: 'hello', timestamp: 2 },
		];
		const store = new MockHistoryStore([record('c1', 'sess-1', messages)]);
		const result = await new ResumeConversationUseCase(store).execute('c1');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toEqual({
			conversationId: 'c1',
			title: 't:c1',
			messages,
			sessionId: 'sess-1',
		});
	});

	it('resolves sessionId=null for a conversation with no resolvable session (EC-TS-5)', async () => {
		const store = new MockHistoryStore([record('c2', null, [])]);
		const result = await new ResumeConversationUseCase(store).execute('c2');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.sessionId).toBeNull();
	});

	it('returns err (no throw) for a missing record (EC-TS-6)', async () => {
		const useCase = new ResumeConversationUseCase(new MockHistoryStore());
		const result = await useCase.execute('absent');
		expect(result.ok).toBe(false);
	});
});
