/**
 * T-MPS-068 — `chatThreadsStore.createThread` rejects when at tab cap.
 *
 * Satisfies REQ-MPS-025: IF the user attempts to create a new thread when the
 * open-tab count is at `settings.chatTabCap` (default 10), THEN the system
 * shall surface a warning and shall not create the thread.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

import { useChatThreadsStore } from '@/ui/stores/chatThreadsStore';

describe('useChatThreadsStore().createThread tab cap (REQ-MPS-025, TST-MPS-14)', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('rejects the 11th create attempt with code "tab-cap" and does not grow the map', () => {
		const store = useChatThreadsStore();
		for (let i = 0; i < 10; i++) {
			const out = store.createThread({
				feature: null,
				transport: { provider: 'claude', mode: 'cli' },
				logPath: `specs/_chat/t${i}.md`,
				tabCap: 10,
			});
			expect(out.ok).toBe(true);
		}
		expect(store.chatThreads.size).toBe(10);

		const eleventh = store.createThread({
			feature: null,
			transport: { provider: 'claude', mode: 'cli' },
			logPath: 'specs/_chat/t10.md',
			tabCap: 10,
		});
		expect(eleventh.ok).toBe(false);
		if (eleventh.ok) return;
		expect(eleventh.error.code).toBe('tab-cap');
		expect(store.chatThreads.size).toBe(10);
	});

	it('does not change activeThreadId when the create is rejected', () => {
		const store = useChatThreadsStore();
		let lastId: string | null = null;
		for (let i = 0; i < 10; i++) {
			const out = store.createThread({
				feature: null,
				transport: { provider: 'claude', mode: 'cli' },
				logPath: `specs/_chat/t${i}.md`,
				tabCap: 10,
			});
			if (out.ok) lastId = out.value.threadId;
		}
		expect(store.activeThreadId).toBe(lastId);

		const rejected = store.createThread({
			feature: null,
			transport: { provider: 'claude', mode: 'cli' },
			logPath: 'specs/_chat/overflow.md',
			tabCap: 10,
		});
		expect(rejected.ok).toBe(false);
		expect(store.activeThreadId).toBe(lastId);
	});

	it('honours a smaller cap value when provided', () => {
		const store = useChatThreadsStore();
		for (let i = 0; i < 3; i++) {
			const out = store.createThread({
				feature: null,
				transport: { provider: 'claude', mode: 'cli' },
				logPath: `specs/_chat/t${i}.md`,
				tabCap: 3,
			});
			expect(out.ok).toBe(true);
		}
		const rejected = store.createThread({
			feature: null,
			transport: { provider: 'claude', mode: 'cli' },
			logPath: 'specs/_chat/t3.md',
			tabCap: 3,
		});
		expect(rejected.ok).toBe(false);
		expect(store.chatThreads.size).toBe(3);
	});
});
