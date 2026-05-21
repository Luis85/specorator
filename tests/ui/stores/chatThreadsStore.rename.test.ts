/**
 * T-MPS-069 — `chatThreadsStore.renameThread` persists title.
 *
 * Satisfies REQ-MPS-020, TST-MPS-11.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

import { useChatThreadsStore } from '@/ui/stores/chatThreadsStore';
import type { ChatThreadRecord } from '@/domain/chat/ChatThreadRecord';

function makeThread(threadId: string, overrides: Partial<ChatThreadRecord> = {}): ChatThreadRecord {
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

describe('useChatThreadsStore().renameThread (REQ-MPS-020)', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('writes the new title onto the existing ChatThreadRecord', () => {
		const store = useChatThreadsStore();
		store.upsertThread(makeThread('t1'));
		store.renameThread('t1', 'Pricing notes');
		expect(store.chatThreads.get('t1')?.title).toBe('Pricing notes');
	});

	it('is a no-op when the thread is unknown', () => {
		const store = useChatThreadsStore();
		store.renameThread('ghost', 'Anything');
		expect(store.chatThreads.size).toBe(0);
	});

	it('replaces the previous title (overwrites, does not append)', () => {
		const store = useChatThreadsStore();
		store.upsertThread(makeThread('t1', { title: 'Old' }));
		store.renameThread('t1', 'New');
		expect(store.chatThreads.get('t1')?.title).toBe('New');
	});

	it('does not mutate unrelated thread records', () => {
		const store = useChatThreadsStore();
		store.upsertThread(makeThread('t1', { title: 'A' }));
		store.upsertThread(makeThread('t2', { title: 'B' }));
		store.renameThread('t1', 'AA');
		expect(store.chatThreads.get('t2')?.title).toBe('B');
	});

	it('produces a new Map reference so Vue reactivity triggers', () => {
		const store = useChatThreadsStore();
		store.upsertThread(makeThread('t1'));
		const before = store.chatThreads;
		store.renameThread('t1', 'Renamed');
		expect(store.chatThreads).not.toBe(before);
	});
});
