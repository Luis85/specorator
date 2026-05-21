/**
 * T-MPS-071 — `chatThreadsStore.deleteThread` removes record + active fallback.
 *
 * Satisfies REQ-MPS-022, TST-MPS-12. The actual `VaultPort.deleteFile` call is
 * orchestrated by the composable that owns the modal confirmation; this test
 * verifies the in-memory mutation contract: the record disappears from the
 * map and the active id falls back to the most-recently-used remaining
 * thread (per spec.md §10 edge case "User deletes the active thread").
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

describe('useChatThreadsStore().deleteThread (REQ-MPS-022)', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('removes the matching record from the map', () => {
		const store = useChatThreadsStore();
		store.upsertThread(makeThread('t1'));
		store.upsertThread(makeThread('t2'));
		store.deleteThread('t1');
		expect(store.chatThreads.has('t1')).toBe(false);
		expect(store.chatThreads.has('t2')).toBe(true);
	});

	it('falls back to the most-recently-used remaining thread when deleting the active one', () => {
		const store = useChatThreadsStore();
		store.upsertThread(makeThread('t1', { lastUsedAt: '2026-05-10T00:00:00.000Z' }));
		store.upsertThread(makeThread('t2', { lastUsedAt: '2026-05-12T00:00:00.000Z' }));
		store.upsertThread(makeThread('t3', { lastUsedAt: '2026-05-15T00:00:00.000Z' }));
		store.setActiveThreadId('t3');
		store.deleteThread('t3');
		expect(store.activeThreadId).toBe('t2');
	});

	it('sets activeThreadId to null when the last thread is deleted', () => {
		const store = useChatThreadsStore();
		store.upsertThread(makeThread('t1'));
		store.setActiveThreadId('t1');
		store.deleteThread('t1');
		expect(store.chatThreads.size).toBe(0);
		expect(store.activeThreadId).toBeNull();
	});

	it('preserves the active id when deleting a non-active thread', () => {
		const store = useChatThreadsStore();
		store.upsertThread(makeThread('t1'));
		store.upsertThread(makeThread('t2'));
		store.setActiveThreadId('t1');
		store.deleteThread('t2');
		expect(store.activeThreadId).toBe('t1');
	});

	it('returns the deleted record so the caller can delete its logPath', () => {
		const store = useChatThreadsStore();
		const record = makeThread('t1', { logPath: 'specs/_chat/t1.md' });
		store.upsertThread(record);
		const deleted = store.deleteThread('t1');
		expect(deleted?.logPath).toBe('specs/_chat/t1.md');
	});

	it('returns null when the thread is unknown (no-op)', () => {
		const store = useChatThreadsStore();
		const result = store.deleteThread('ghost');
		expect(result).toBeNull();
	});
});
