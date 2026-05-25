import { describe, it, expect } from 'vitest';
import { MockHistoryStore } from '@/infrastructure/mock/MockHistoryStore';
import { ForkConversationUseCase } from '@/application/threads/ForkConversationUseCase';
import type { ConversationRecord } from '@/domain/chat/ConversationRecord';
import type { ChatMessage } from '@/domain/chat/ChatMessage';

/**
 * TEST-TS-014 (use-case U leg) — `ForkConversationUseCase` (SPEC-TS-013,
 * REQ-TS-018, EC-TS-7). Forwards `history.buildForkPlan` (derive-not-copy): fork
 * at M3 of M1..M5 → plan M1..M3 + forkSource{resumeAt:M3}; source UNCHANGED;
 * first-message fork → M1; id absent → err. Result-returning.
 */
function msg(id: string, role: 'user' | 'assistant'): ChatMessage {
	return { id, role, content: id, timestamp: 1 };
}

function fiveTurnRecord(): ConversationRecord {
	return {
		version: 1,
		meta: {
			id: 'src',
			title: 'Source title',
			titleManual: false,
			createdAt: 1,
			updatedAt: 2,
			providerId: 'claude',
			sessionId: 'sess-src',
		},
		messages: [
			msg('m1', 'user'),
			msg('m2', 'assistant'),
			msg('m3', 'user'),
			msg('m4', 'assistant'),
			msg('m5', 'user'),
		],
		providerState: {},
	};
}

describe('TEST-TS-014 ForkConversationUseCase', () => {
	it('derives a plan truncated through the chosen message (M1..M3) without mutating the source', async () => {
		const store = new MockHistoryStore([fiveTurnRecord()]);
		const before = store.getAllConversations()[0].messages.map((m) => m.id);

		const result = await new ForkConversationUseCase(store).execute('src', 'm3');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.messages.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
		expect(result.value.sourceTitle).toBe('Source title');
		expect(result.value.providerState).toEqual({
			forkSource: { sessionId: 'sess-src', resumeAt: 'm3' },
		});

		// Source record untouched (EC-TS-7).
		const after = store.getAllConversations()[0].messages.map((m) => m.id);
		expect(after).toEqual(before);
	});

	it('forks at the first user message (EC-TS-7)', async () => {
		const store = new MockHistoryStore([fiveTurnRecord()]);
		const result = await new ForkConversationUseCase(store).execute('src', 'm1');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.messages.map((m) => m.id)).toEqual(['m1']);
	});

	it('returns err when the resumeAt id is absent', async () => {
		const store = new MockHistoryStore([fiveTurnRecord()]);
		const result = await new ForkConversationUseCase(store).execute('src', 'nope');
		expect(result.ok).toBe(false);
	});

	it('returns err when the source conversation is missing', async () => {
		const result = await new ForkConversationUseCase(new MockHistoryStore()).execute('absent', 'm1');
		expect(result.ok).toBe(false);
	});
});
