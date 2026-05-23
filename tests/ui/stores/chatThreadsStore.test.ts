/**
 * Tests for `useChatThreadsStore()` — the persisted-threads slice extracted
 * from the former monolithic `chatStore` (WP-3, Arch review #4).
 *
 * Cases migrated from `tests/ui/stores/chatStore.test.ts` (T-ASM-051,
 * REQ-ASM-031, REQ-ASM-037).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useChatThreadsStore } from '@/ui/stores/chatThreadsStore';
import { asSessionId } from '@/domain/chat/SessionId';
import type { ChatThreadRecord } from '@/domain/chat/ChatThreadRecord';

function makeThread(
	threadId: string,
	overrides: Partial<ChatThreadRecord> = {},
): ChatThreadRecord {
	return {
		threadId,
		sessionId: null,
		feature: null,
		logPath: `specs/_chat/${threadId}.md`,
		transport: { provider: 'claude', mode: 'cli' },
		title: '',
		forkParent: null,
		createdAt: '2026-05-14T00:00:00.000Z',
		lastUsedAt: '2026-05-14T00:00:00.000Z',
		...overrides,
	};
}

describe('useChatThreadsStore()', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	describe('initial state', () => {
		it('REQ-ASM-037: chatThreads is an empty Map', () => {
			const store = useChatThreadsStore();
			expect(store.chatThreads).toBeInstanceOf(Map);
			expect(store.chatThreads.size).toBe(0);
		});

		it('REQ-ASM-031: activeThreadId is null', () => {
			const store = useChatThreadsStore();
			expect(store.activeThreadId).toBeNull();
		});
	});

	describe('upsertThread', () => {
		it('REQ-ASM-037: adds a new ChatThreadRecord keyed by threadId', () => {
			const store = useChatThreadsStore();
			const record = makeThread('t1');
			store.upsertThread(record);
			expect(store.chatThreads.size).toBe(1);
			expect(store.chatThreads.get('t1')).toEqual(record);
		});

		it('replaces an existing record with the same threadId', () => {
			const store = useChatThreadsStore();
			store.upsertThread(makeThread('t1', { feature: 'a' }));
			store.upsertThread(makeThread('t1', { feature: 'b' }));
			expect(store.chatThreads.size).toBe(1);
			expect(store.chatThreads.get('t1')?.feature).toBe('b');
		});

		it('keeps unrelated threads intact when upserting another', () => {
			const store = useChatThreadsStore();
			store.upsertThread(makeThread('t1'));
			store.upsertThread(makeThread('t2'));
			expect(store.chatThreads.size).toBe(2);
			expect(store.chatThreads.has('t1')).toBe(true);
			expect(store.chatThreads.has('t2')).toBe(true);
		});
	});

	describe('setActiveThreadId', () => {
		it('REQ-ASM-031: switches the active thread', () => {
			const store = useChatThreadsStore();
			store.setActiveThreadId('t1');
			expect(store.activeThreadId).toBe('t1');
		});

		it('null clears the active thread', () => {
			const store = useChatThreadsStore();
			store.setActiveThreadId('t1');
			store.setActiveThreadId(null);
			expect(store.activeThreadId).toBeNull();
		});

		it('does not mutate the chatThreads map', () => {
			const store = useChatThreadsStore();
			store.upsertThread(makeThread('t1'));
			const before = store.chatThreads;
			store.setActiveThreadId('t1');
			expect(store.chatThreads).toBe(before);
		});
	});

	describe('captureSessionId', () => {
		it('REQ-ASM-031: stores sessionId on the matching ChatThreadRecord', () => {
			const store = useChatThreadsStore();
			store.upsertThread(makeThread('t1'));
			store.captureSessionId('t1', asSessionId('sess-abc'));
			expect(store.chatThreads.get('t1')?.sessionId).toBe('sess-abc');
		});

		it('is a no-op when the thread is unknown', () => {
			const store = useChatThreadsStore();
			store.captureSessionId('ghost', asSessionId('sess-xyz'));
			expect(store.chatThreads.size).toBe(0);
		});
	});

	describe('clearSessionId', () => {
		it('Q-F.4: resets sessionId to null on the matching thread', () => {
			const store = useChatThreadsStore();
			store.upsertThread(makeThread('t1', { sessionId: asSessionId('sess-dead') }));
			store.clearSessionId('t1');
			expect(store.chatThreads.get('t1')?.sessionId).toBeNull();
		});

		it('is a no-op when the thread is unknown', () => {
			const store = useChatThreadsStore();
			store.clearSessionId('ghost');
			expect(store.chatThreads.size).toBe(0);
		});

		it('preserves other thread fields unchanged', () => {
			const store = useChatThreadsStore();
			const record = makeThread('t1', {
				sessionId: asSessionId('sess-dead'),
				feature: 'foo',
				title: 'My thread',
			});
			store.upsertThread(record);
			store.clearSessionId('t1');
			const after = store.chatThreads.get('t1');
			expect(after?.feature).toBe('foo');
			expect(after?.title).toBe('My thread');
			expect(after?.sessionId).toBeNull();
		});
	});

	describe('markThreadUsed', () => {
		it('REQ-ASM-037: updates lastUsedAt on the matching thread', () => {
			const store = useChatThreadsStore();
			store.upsertThread(makeThread('t1', { lastUsedAt: '2020-01-01T00:00:00.000Z' }));
			const before = store.chatThreads.get('t1')!.lastUsedAt;
			store.markThreadUsed('t1');
			const after = store.chatThreads.get('t1')!.lastUsedAt;
			expect(after).not.toBe(before);
			expect(new Date(after).getTime()).toBeGreaterThan(new Date(before).getTime());
		});

		it('is a no-op when the thread is unknown', () => {
			const store = useChatThreadsStore();
			store.markThreadUsed('ghost');
			expect(store.chatThreads.size).toBe(0);
		});
	});

	describe('reset', () => {
		it('drops every thread and clears the active id', () => {
			const store = useChatThreadsStore();
			store.upsertThread(makeThread('t1'));
			store.upsertThread(makeThread('t2'));
			store.setActiveThreadId('t1');
			store.reset();
			expect(store.chatThreads.size).toBe(0);
			expect(store.activeThreadId).toBeNull();
		});
	});
});
