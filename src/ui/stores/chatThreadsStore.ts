import { defineStore } from 'pinia';
import { ref } from 'vue';

import type { ChatThreadRecord } from '@/domain/chat/ChatThreadRecord';
import type { SessionId } from '@/domain/chat/SessionId';

/**
 * Pinia store for the **persisted** chat-thread lifecycle (Arch review #4,
 * WP-3 split of the former monolithic `chatStore`).
 *
 * Owns the `chatThreads` map (mirrored to `_storedData.specorator.chatThreads`
 * via `chatThreadsPersistence`) plus the currently-active `threadId`. Does NOT
 * own per-turn streaming state, file-write proposals, or the chat-panel UI
 * surface — those live in `streamingTurnStore`, `proposalStore`, and
 * `messagesStore` respectively.
 *
 * Setting `activeThreadId` here intentionally does NOT reset streaming slots:
 * cross-store side-effects belong in the `useChatReset` composable so the four
 * stores stay independent and testable.
 *
 * Satisfies REQ-ASM-031, REQ-ASM-037.
 */
export const useChatThreadsStore = defineStore('chatThreads', () => {
	/**
	 * All known chat threads, keyed by `threadId`. Hydrated from
	 * `_storedData.specorator.chatThreads` at view mount (SPEC §9.3) and
	 * mutated by `upsertThread` / `captureSessionId` / `markThreadUsed`.
	 * REQ-ASM-037.
	 */
	const chatThreads = ref<Map<string, ChatThreadRecord>>(new Map());

	/**
	 * `threadId` of the thread the user is currently viewing, or `null` when
	 * no thread is selected. REQ-ASM-031.
	 */
	const activeThreadId = ref<string | null>(null);

	/**
	 * Adds a new `ChatThreadRecord`, or replaces an existing one with the
	 * same `threadId`. REQ-ASM-037.
	 */
	function upsertThread(record: ChatThreadRecord): void {
		const next = new Map(chatThreads.value);
		next.set(record.threadId, record);
		chatThreads.value = next;
	}

	/**
	 * Switches the active thread. Passing `null` clears the selection. Does
	 * NOT clear per-turn transient slots — call `useChatReset` (or the
	 * specific store's reset) at the use site so this store stays decoupled
	 * from streaming/proposal state. REQ-ASM-031.
	 */
	function setActiveThreadId(threadId: string | null): void {
		activeThreadId.value = threadId;
	}

	/**
	 * Captures the `system/init` session id for an existing thread. No-op
	 * if the thread is unknown — the caller is expected to `upsertThread`
	 * first. REQ-ASM-031, REQ-ASM-037.
	 */
	function captureSessionId(threadId: string, sessionId: SessionId): void {
		const existing = chatThreads.value.get(threadId);
		if (existing === undefined) return;
		const next = new Map(chatThreads.value);
		next.set(threadId, { ...existing, sessionId });
		chatThreads.value = next;
	}

	/**
	 * Bumps `lastUsedAt` on the matching thread to "now" (ISO 8601 UTC).
	 * No-op if the thread is unknown. REQ-ASM-037.
	 */
	function markThreadUsed(threadId: string): void {
		const existing = chatThreads.value.get(threadId);
		if (existing === undefined) return;
		const next = new Map(chatThreads.value);
		next.set(threadId, { ...existing, lastUsedAt: new Date().toISOString() });
		chatThreads.value = next;
	}

	/**
	 * Clears the threads map AND active id. Used by `useChatReset.resetAll()`
	 * and end-to-end test fixtures. Each store provides its own `reset()`
	 * because Pinia's default `$reset` does not restore Maps.
	 */
	function reset(): void {
		chatThreads.value = new Map();
		activeThreadId.value = null;
	}

	return {
		chatThreads,
		activeThreadId,
		upsertThread,
		setActiveThreadId,
		captureSessionId,
		markThreadUsed,
		reset,
	};
});
