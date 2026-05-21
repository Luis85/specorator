/**
 * T-MPS-073 — `chatThreadsStore.restoreActiveThread`.
 *
 * Satisfies REQ-MPS-024: WHEN the plugin reloads, restore the previously
 * persisted active thread id from `_storedData.specorator.activeThreadId`
 * if it still exists; otherwise the most-recently-used thread becomes
 * active.
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

describe('useChatThreadsStore().restoreActiveThread (REQ-MPS-024)', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('uses the persisted id when that thread still exists', () => {
		const store = useChatThreadsStore();
		store.upsertThread(makeThread('t1', { lastUsedAt: '2026-05-10T00:00:00.000Z' }));
		store.upsertThread(makeThread('t2', { lastUsedAt: '2026-05-12T00:00:00.000Z' }));
		store.restoreActiveThread('t1');
		expect(store.activeThreadId).toBe('t1');
	});

	it('falls back to the most-recently-used record when persisted id no longer exists', () => {
		const store = useChatThreadsStore();
		store.upsertThread(makeThread('t1', { lastUsedAt: '2026-05-10T00:00:00.000Z' }));
		store.upsertThread(makeThread('t2', { lastUsedAt: '2026-05-12T00:00:00.000Z' }));
		store.upsertThread(makeThread('t3', { lastUsedAt: '2026-05-15T00:00:00.000Z' }));
		store.restoreActiveThread('ghost');
		expect(store.activeThreadId).toBe('t3');
	});

	it('falls back to most-recently-used when persisted id is null', () => {
		const store = useChatThreadsStore();
		store.upsertThread(makeThread('t1', { lastUsedAt: '2026-05-10T00:00:00.000Z' }));
		store.upsertThread(makeThread('t2', { lastUsedAt: '2026-05-12T00:00:00.000Z' }));
		store.restoreActiveThread(null);
		expect(store.activeThreadId).toBe('t2');
	});

	it('sets activeThreadId to null when no threads exist', () => {
		const store = useChatThreadsStore();
		store.restoreActiveThread('whatever');
		expect(store.activeThreadId).toBeNull();
	});
});
