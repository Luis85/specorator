/**
 * T-MPS-070 — `chatThreadsStore.applyDefaultTitleFromMessage` derives the
 * thread title from the first user message (first 40 characters).
 *
 * Satisfies REQ-MPS-021.
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

describe('useChatThreadsStore().applyDefaultTitleFromMessage (REQ-MPS-021)', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('uses the first 40 characters of the message body when title is empty', () => {
		const store = useChatThreadsStore();
		store.upsertThread(makeThread('t1', { title: '' }));
		store.applyDefaultTitleFromMessage(
			't1',
			'Help me draft a pricing memo for the Q3 plan',
		);
		expect(store.chatThreads.get('t1')?.title).toBe(
			'Help me draft a pricing memo for the Q3',
		);
	});

	it('keeps short messages intact when shorter than 40 chars', () => {
		const store = useChatThreadsStore();
		store.upsertThread(makeThread('t1', { title: '' }));
		store.applyDefaultTitleFromMessage('t1', 'Hello');
		expect(store.chatThreads.get('t1')?.title).toBe('Hello');
	});

	it('does NOT overwrite a non-empty title (user rename wins)', () => {
		const store = useChatThreadsStore();
		store.upsertThread(makeThread('t1', { title: 'My custom name' }));
		store.applyDefaultTitleFromMessage('t1', 'Another long message body here');
		expect(store.chatThreads.get('t1')?.title).toBe('My custom name');
	});

	it('is a no-op when the thread is unknown', () => {
		const store = useChatThreadsStore();
		store.applyDefaultTitleFromMessage('ghost', 'whatever');
		expect(store.chatThreads.size).toBe(0);
	});

	it('exactly 40 chars are taken — no off-by-one', () => {
		const store = useChatThreadsStore();
		store.upsertThread(makeThread('t1', { title: '' }));
		// 50-char body
		store.applyDefaultTitleFromMessage('t1', 'a'.repeat(50));
		expect(store.chatThreads.get('t1')?.title.length).toBe(40);
	});
});
