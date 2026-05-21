/**
 * T-MPS-067 — `chatThreadsStore.createThread` action.
 *
 * Satisfies REQ-MPS-019: WHEN the user clicks "New thread", create a new
 * `ChatThreadRecord` with a fresh UUID, the current `feature` slug and the
 * resolved `(provider, mode)` selection, and set it active. The action
 * allocates a `logPath`.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

import { useChatThreadsStore } from '@/ui/stores/chatThreadsStore';

describe('useChatThreadsStore().createThread (REQ-MPS-019)', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('increases the chatThreads map size by 1', () => {
		const store = useChatThreadsStore();
		const before = store.chatThreads.size;
		const outcome = store.createThread({
			feature: 'multi-provider-agent-sidepanel',
			transport: { provider: 'claude', mode: 'cli' },
			logPath: 'specs/_chat/t-new.md',
		});
		expect(outcome.ok).toBe(true);
		expect(store.chatThreads.size).toBe(before + 1);
	});

	it('activates the newly created thread id', () => {
		const store = useChatThreadsStore();
		const outcome = store.createThread({
			feature: null,
			transport: { provider: 'claude', mode: 'cli' },
			logPath: 'specs/_chat/t-new.md',
		});
		expect(outcome.ok).toBe(true);
		if (!outcome.ok) return;
		expect(store.activeThreadId).toBe(outcome.value.threadId);
	});

	it('persists the supplied feature slug and transport on the new record', () => {
		const store = useChatThreadsStore();
		const outcome = store.createThread({
			feature: 'multi-provider-agent-sidepanel',
			transport: { provider: 'cursor', mode: 'api' },
			logPath: 'specs/_chat/abc.md',
		});
		expect(outcome.ok).toBe(true);
		if (!outcome.ok) return;
		const record = store.chatThreads.get(outcome.value.threadId);
		expect(record?.feature).toBe('multi-provider-agent-sidepanel');
		expect(record?.transport).toEqual({ provider: 'cursor', mode: 'api' });
	});

	it('allocates the supplied logPath on the record', () => {
		const store = useChatThreadsStore();
		const outcome = store.createThread({
			feature: null,
			transport: { provider: 'claude', mode: 'cli' },
			logPath: 'specs/_chat/path-A.md',
		});
		expect(outcome.ok).toBe(true);
		if (!outcome.ok) return;
		expect(store.chatThreads.get(outcome.value.threadId)?.logPath).toBe(
			'specs/_chat/path-A.md',
		);
	});

	it('mints a fresh non-empty threadId each call (UUID v4 expectation)', () => {
		const store = useChatThreadsStore();
		const a = store.createThread({
			feature: null,
			transport: { provider: 'claude', mode: 'cli' },
			logPath: 'specs/_chat/a.md',
		});
		const b = store.createThread({
			feature: null,
			transport: { provider: 'claude', mode: 'cli' },
			logPath: 'specs/_chat/b.md',
		});
		expect(a.ok).toBe(true);
		expect(b.ok).toBe(true);
		if (!a.ok || !b.ok) return;
		expect(a.value.threadId).not.toBe(b.value.threadId);
		expect(a.value.threadId.length).toBeGreaterThan(0);
	});

	it('initialises title to "" and forkParent to null on a fresh thread', () => {
		const store = useChatThreadsStore();
		const outcome = store.createThread({
			feature: null,
			transport: { provider: 'claude', mode: 'cli' },
			logPath: 'specs/_chat/p.md',
		});
		expect(outcome.ok).toBe(true);
		if (!outcome.ok) return;
		const record = store.chatThreads.get(outcome.value.threadId);
		expect(record?.title).toBe('');
		expect(record?.forkParent).toBeNull();
	});
});
