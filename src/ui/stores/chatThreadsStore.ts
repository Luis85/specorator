import { defineStore } from 'pinia';
import { ref } from 'vue';

import type { ChatThreadRecord } from '@/domain/chat/ChatThreadRecord';
import type { ChatMessage } from '@/domain/chat/ChatMessage';
import type { SessionId } from '@/domain/chat/SessionId';
import type { ProviderId, ProviderMode } from '@/domain/chat/ProviderSelection';
import type { Result } from '@/domain/shared/Result';
import { ok, err } from '@/domain/shared/Result';

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
 * **WS-6 (T-MPS-074, SPEC-MPS-001 §2.6, §7):** extended with the multi-thread
 * switcher lifecycle actions — `createThread`, `renameThread`,
 * `applyDefaultTitleFromMessage`, `deleteThread`, `forkThread`, and
 * `restoreActiveThread`. Side-effects on disk (log-file delete) are kept out
 * of the store; the composable that wires the modal confirmation invokes
 * `VaultPort.deleteFile` after the in-memory mutation succeeds, using the
 * `logPath` returned by `deleteThread`.
 *
 * Satisfies REQ-ASM-031, REQ-ASM-037, REQ-MPS-018, REQ-MPS-019, REQ-MPS-020,
 * REQ-MPS-021, REQ-MPS-022, REQ-MPS-023, REQ-MPS-024, REQ-MPS-025.
 */

/** Default `chatTabCap` when no caller-supplied value is provided (REQ-MPS-025). */
const DEFAULT_TAB_CAP = 10;

/** Default-title cap from the first user message (REQ-MPS-021). */
const DEFAULT_TITLE_MAX_CHARS = 40;

export interface CreateThreadInput {
	readonly feature: string | null;
	readonly transport: {
		readonly provider: ProviderId;
		readonly mode: ProviderMode;
	};
	readonly logPath: string;
	/**
	 * Maximum number of open threads. Defaults to 10 per REQ-MPS-025; the
	 * caller (composable layer) supplies the live `settings.chatTabCap`.
	 */
	readonly tabCap?: number;
	/**
	 * Optional pre-allocated thread id. When omitted, a UUID v4 is minted via
	 * `crypto.randomUUID()`. Tests and migration code may pin the id.
	 */
	readonly threadId?: string;
	/**
	 * Optional override for "now" (ISO 8601 UTC). Defaults to
	 * `new Date().toISOString()`. Tests pin it for determinism.
	 */
	readonly now?: string;
}

export interface ForkThreadInput {
	readonly sourceMessages: ReadonlyArray<ChatMessage>;
	/** Inclusive last message index to copy onto the fork. */
	readonly atIndex: number;
	/** Vault-relative path allocated for the fork's session log. */
	readonly newLogPath: string;
	/** See `CreateThreadInput.tabCap`. */
	readonly tabCap?: number;
	readonly newThreadId?: string;
	readonly now?: string;
}

/**
 * Failure raised when `createThread`/`forkThread` cannot proceed because the
 * open-tab cap is full (REQ-MPS-025). The composable maps this to a
 * `NotificationPort.showWarning(t('thread.tabCap.warning'))`.
 */
export class CreateThreadError extends Error {
	readonly code: 'tab-cap';
	constructor(code: 'tab-cap' = 'tab-cap') {
		super(`chatThreadsStore.createThread failed: ${code}`);
		this.name = 'CreateThreadError';
		this.code = code;
		Object.setPrototypeOf(this, new.target.prototype);
	}
}

/**
 * Failure raised when `forkThread` cannot proceed. `'source-missing'` is the
 * defence-in-depth check for a fork action dispatched against an unknown
 * source thread id; `'tab-cap'` mirrors `CreateThreadError` for forks.
 */
export class ForkThreadError extends Error {
	readonly code: 'tab-cap' | 'source-missing';
	constructor(code: 'tab-cap' | 'source-missing') {
		super(`chatThreadsStore.forkThread failed: ${code}`);
		this.name = 'ForkThreadError';
		this.code = code;
		Object.setPrototypeOf(this, new.target.prototype);
	}
}

export interface ForkThreadResult {
	readonly record: ChatThreadRecord;
	readonly copiedMessages: ReadonlyArray<ChatMessage>;
}

function mintThreadId(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}
	return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function pickMostRecentlyUsedId(
	records: ReadonlyMap<string, ChatThreadRecord>,
): string | null {
	let bestId: string | null = null;
	let bestAt = '';
	for (const [id, record] of records) {
		if (record.lastUsedAt > bestAt) {
			bestAt = record.lastUsedAt;
			bestId = id;
		}
	}
	return bestId;
}

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
	 * Create a new thread per REQ-MPS-019. Mints a UUID v4 (override via
	 * `input.threadId`), inherits the resolved `(provider, mode)` and the
	 * supplied `feature`, and activates the new id. Rejects with
	 * `{ code: 'tab-cap' }` when the in-memory map already holds `tabCap`
	 * threads (REQ-MPS-025).
	 */
	function createThread(
		input: CreateThreadInput,
	): Result<ChatThreadRecord, CreateThreadError> {
		const cap = input.tabCap ?? DEFAULT_TAB_CAP;
		if (chatThreads.value.size >= cap) {
			return err(new CreateThreadError('tab-cap'));
		}
		const now = input.now ?? new Date().toISOString();
		const threadId = input.threadId ?? mintThreadId();
		const record: ChatThreadRecord = {
			threadId,
			sessionId: null,
			feature: input.feature,
			logPath: input.logPath,
			transport: input.transport,
			title: '',
			forkParent: null,
			createdAt: now,
			lastUsedAt: now,
		};
		const next = new Map(chatThreads.value);
		next.set(threadId, record);
		chatThreads.value = next;
		activeThreadId.value = threadId;
		return ok(record);
	}

	/**
	 * Rename a thread (REQ-MPS-020). Overwrites the existing title. No-op
	 * when the thread is unknown.
	 */
	function renameThread(threadId: string, title: string): void {
		const existing = chatThreads.value.get(threadId);
		if (existing === undefined) return;
		const next = new Map(chatThreads.value);
		next.set(threadId, { ...existing, title });
		chatThreads.value = next;
	}

	/**
	 * Derive the default thread title from a message body (REQ-MPS-021). Only
	 * runs when the current title is empty — user renames win over the
	 * derivation. Takes the first 40 characters of `message` verbatim.
	 */
	function applyDefaultTitleFromMessage(threadId: string, message: string): void {
		const existing = chatThreads.value.get(threadId);
		if (existing === undefined) return;
		if (existing.title !== '') return;
		// REQ-MPS-021 acceptance example trims trailing whitespace so the
		// derived title doesn't end with a half-word boundary space: 40-char
		// slice of "Help me draft a pricing memo for the Q3 plan" produces
		// "Help me draft a pricing memo for the Q3 " which the spec example
		// shows as "Help me draft a pricing memo for the Q3" (no trailing
		// space). `trimEnd()` matches that contract.
		const next = new Map(chatThreads.value);
		next.set(threadId, {
			...existing,
			title: message.slice(0, DEFAULT_TITLE_MAX_CHARS).trimEnd(),
		});
		chatThreads.value = next;
	}

	/**
	 * Remove a thread (REQ-MPS-022). Returns the removed record so the caller
	 * can `VaultPort.deleteFile(record.logPath)` outside the store. When the
	 * deleted thread was active, `activeThreadId` falls back to the
	 * most-recently-used remaining thread, or `null` when none remain
	 * (spec.md §10 edge case row "User deletes the active thread").
	 */
	function deleteThread(threadId: string): ChatThreadRecord | null {
		const existing = chatThreads.value.get(threadId);
		if (existing === undefined) return null;
		const next = new Map(chatThreads.value);
		next.delete(threadId);
		chatThreads.value = next;
		if (activeThreadId.value === threadId) {
			activeThreadId.value = pickMostRecentlyUsedId(next);
		}
		return existing;
	}

	/**
	 * Fork a thread (REQ-MPS-023). Creates a new record with
	 * `forkParent === sourceThreadId`, inherits `feature` and `transport`
	 * from the source, and copies `sourceMessages[0..atIndex]` (inclusive)
	 * with their `threadId` rewritten to the new id. The caller appends the
	 * copied messages into `messagesStore`. Rejects with `'tab-cap'` when at
	 * the cap, or `'source-missing'` when the source thread is unknown.
	 */
	function forkThread(
		sourceThreadId: string,
		input: ForkThreadInput,
	): Result<ForkThreadResult, ForkThreadError> {
		const source = chatThreads.value.get(sourceThreadId);
		if (source === undefined) return err(new ForkThreadError('source-missing'));
		const cap = input.tabCap ?? DEFAULT_TAB_CAP;
		if (chatThreads.value.size >= cap) return err(new ForkThreadError('tab-cap'));

		const now = input.now ?? new Date().toISOString();
		const newId = input.newThreadId ?? mintThreadId();
		const sliceEnd = Math.max(0, input.atIndex + 1);
		const copiedMessages: ChatMessage[] = input.sourceMessages
			.slice(0, sliceEnd)
			.map((m) => ({ ...m, threadId: newId }));

		const record: ChatThreadRecord = {
			threadId: newId,
			sessionId: null,
			feature: source.feature,
			logPath: input.newLogPath,
			transport: source.transport,
			title: '',
			forkParent: sourceThreadId,
			createdAt: now,
			lastUsedAt: now,
		};
		const next = new Map(chatThreads.value);
		next.set(newId, record);
		chatThreads.value = next;
		activeThreadId.value = newId;
		return ok({ record, copiedMessages });
	}

	/**
	 * Restore the active thread at view mount (REQ-MPS-024). Uses the
	 * persisted id when that thread still exists; otherwise falls back to
	 * the most-recently-used record, or `null` when no threads are present.
	 */
	function restoreActiveThread(persistedId: string | null): void {
		if (persistedId !== null && chatThreads.value.has(persistedId)) {
			activeThreadId.value = persistedId;
			return;
		}
		activeThreadId.value = pickMostRecentlyUsedId(chatThreads.value);
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
		createThread,
		renameThread,
		applyDefaultTitleFromMessage,
		deleteThread,
		forkThread,
		restoreActiveThread,
		reset,
	};
});
