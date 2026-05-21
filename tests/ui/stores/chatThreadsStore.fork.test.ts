/**
 * T-MPS-072 — `chatThreadsStore.forkThread` copies messages + sets forkParent.
 *
 * Satisfies REQ-MPS-023, TST-MPS-13.
 *
 * Contract: the store action mints a new `ChatThreadRecord` carrying
 * `forkParent === sourceThreadId`, inheriting `feature` and `transport`
 * from the source. The action returns the new record plus the sliced
 * message array (indices `[0..atIndex]`) so the calling composable can
 * mirror them into `messagesStore`.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

import { useChatThreadsStore } from '@/ui/stores/chatThreadsStore';
import type { ChatThreadRecord } from '@/domain/chat/ChatThreadRecord';
import type { ChatMessage } from '@/domain/chat/ChatMessage';

function makeThread(threadId: string, overrides: Partial<ChatThreadRecord> = {}): ChatThreadRecord {
	return {
		threadId,
		sessionId: null,
		feature: 'multi-provider-agent-sidepanel',
		logPath: `specs/_chat/${threadId}.md`,
		transport: { provider: 'claude', mode: 'cli' },
		title: 'Source',
		forkParent: null,
		createdAt: '2026-05-14T00:00:00.000Z',
		lastUsedAt: '2026-05-14T00:00:00.000Z',
		...overrides,
	};
}

function makeMessage(id: string, text: string, role: 'user' | 'assistant' = 'user'): ChatMessage {
	return {
		id,
		threadId: 't1',
		role,
		text,
		createdAt: '2026-05-14T00:00:00.000Z',
	};
}

describe('useChatThreadsStore().forkThread (REQ-MPS-023)', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('creates a new thread whose forkParent is the source threadId', () => {
		const store = useChatThreadsStore();
		store.upsertThread(makeThread('t1'));
		const messages: ChatMessage[] = [
			makeMessage('m0', '0'),
			makeMessage('m1', '1', 'assistant'),
			makeMessage('m2', '2'),
			makeMessage('m3', '3', 'assistant'),
			makeMessage('m4', '4'),
		];
		const outcome = store.forkThread('t1', {
			sourceMessages: messages,
			atIndex: 4,
			newLogPath: 'specs/_chat/fork.md',
		});
		expect(outcome.ok).toBe(true);
		if (!outcome.ok) return;
		expect(outcome.value.record.forkParent).toBe('t1');
	});

	it('copies messages [0..atIndex] inclusive onto the result', () => {
		const store = useChatThreadsStore();
		store.upsertThread(makeThread('t1'));
		const messages: ChatMessage[] = [
			makeMessage('m0', '0'),
			makeMessage('m1', '1'),
			makeMessage('m2', '2'),
			makeMessage('m3', '3'),
			makeMessage('m4', '4'),
		];
		const outcome = store.forkThread('t1', {
			sourceMessages: messages,
			atIndex: 4,
			newLogPath: 'specs/_chat/fork.md',
		});
		expect(outcome.ok).toBe(true);
		if (!outcome.ok) return;
		expect(outcome.value.copiedMessages).toHaveLength(5);
		expect(outcome.value.copiedMessages.map((m) => m.id)).toEqual([
			'm0',
			'm1',
			'm2',
			'm3',
			'm4',
		]);
	});

	it('rewrites the copied messages to carry the new threadId', () => {
		const store = useChatThreadsStore();
		store.upsertThread(makeThread('t1'));
		const messages: ChatMessage[] = [makeMessage('m0', 'a'), makeMessage('m1', 'b')];
		const outcome = store.forkThread('t1', {
			sourceMessages: messages,
			atIndex: 1,
			newLogPath: 'specs/_chat/fork.md',
		});
		expect(outcome.ok).toBe(true);
		if (!outcome.ok) return;
		const newId = outcome.value.record.threadId;
		expect(outcome.value.copiedMessages.every((m) => m.threadId === newId)).toBe(true);
	});

	it('inherits the source feature and transport', () => {
		const store = useChatThreadsStore();
		store.upsertThread(
			makeThread('t1', {
				feature: 'demo',
				transport: { provider: 'cursor', mode: 'api' },
			}),
		);
		const outcome = store.forkThread('t1', {
			sourceMessages: [makeMessage('m0', 'a')],
			atIndex: 0,
			newLogPath: 'specs/_chat/fork.md',
		});
		expect(outcome.ok).toBe(true);
		if (!outcome.ok) return;
		expect(outcome.value.record.feature).toBe('demo');
		expect(outcome.value.record.transport).toEqual({ provider: 'cursor', mode: 'api' });
	});

	it('makes the new thread active', () => {
		const store = useChatThreadsStore();
		store.upsertThread(makeThread('t1'));
		store.setActiveThreadId('t1');
		const outcome = store.forkThread('t1', {
			sourceMessages: [makeMessage('m0', 'a')],
			atIndex: 0,
			newLogPath: 'specs/_chat/fork.md',
		});
		expect(outcome.ok).toBe(true);
		if (!outcome.ok) return;
		expect(store.activeThreadId).toBe(outcome.value.record.threadId);
	});

	it('fails with code "source-missing" when the source thread is unknown', () => {
		const store = useChatThreadsStore();
		const outcome = store.forkThread('ghost', {
			sourceMessages: [],
			atIndex: 0,
			newLogPath: 'specs/_chat/fork.md',
		});
		expect(outcome.ok).toBe(false);
		if (outcome.ok) return;
		expect(outcome.error.code).toBe('source-missing');
	});

	it('respects the tab cap when forking', () => {
		const store = useChatThreadsStore();
		for (let i = 0; i < 10; i++) {
			store.upsertThread(makeThread(`t${i}`));
		}
		const outcome = store.forkThread('t0', {
			sourceMessages: [makeMessage('m0', 'a')],
			atIndex: 0,
			newLogPath: 'specs/_chat/fork.md',
			tabCap: 10,
		});
		expect(outcome.ok).toBe(false);
		if (outcome.ok) return;
		expect(outcome.error.code).toBe('tab-cap');
	});
});
