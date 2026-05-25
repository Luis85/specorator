import { describe, it, expect } from 'vitest';
import { MockHistoryStore } from '@/infrastructure/mock/MockHistoryStore';
import { RenameConversationUseCase } from '@/application/threads/RenameConversationUseCase';
import type { ConversationRecord } from '@/domain/chat/ConversationRecord';
import type { ChatMessage } from '@/domain/chat/ChatMessage';

/**
 * TEST-TS-012 (rename U leg) — `RenameConversationUseCase` (SPEC-TS-017,
 * REQ-TS-011, EC-TS-14). updateMeta(id, {title, titleManual:true, updatedAt}) —
 * meta only, manual-rename precedence. Result-returning.
 */
const messages: ChatMessage[] = [{ id: 'u1', role: 'user', content: 'hi', timestamp: 1 }];

function record(id: string): ConversationRecord {
	return {
		version: 1,
		meta: {
			id,
			title: 'old',
			titleManual: false,
			createdAt: 1,
			updatedAt: 2,
			providerId: 'claude',
			sessionId: null,
		},
		messages,
		providerState: { providerSessionId: 'p1' },
	};
}

describe('TEST-TS-012 RenameConversationUseCase', () => {
	it('sets the new title and titleManual:true, patching meta only', async () => {
		const store = new MockHistoryStore([record('c1')]);
		const result = await new RenameConversationUseCase(store).execute('c1', 'New name');
		expect(result.ok).toBe(true);

		const [stored] = store.getAllConversations();
		expect(stored.meta.title).toBe('New name');
		expect(stored.meta.titleManual).toBe(true);
		// Transcript + providerState untouched (EC-TS-14).
		expect(stored.messages).toEqual(messages);
		expect(stored.providerState).toEqual({ providerSessionId: 'p1' });
	});

	it('returns err for an unknown id', async () => {
		const result = await new RenameConversationUseCase(new MockHistoryStore()).execute(
			'absent',
			'x',
		);
		expect(result.ok).toBe(false);
	});
});
