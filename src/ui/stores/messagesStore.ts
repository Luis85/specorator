import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import type { ChatMessage } from '@/domain/chat/ChatMessage';

/**
 * Plain DTO for a `compact-boundary` synthetic notice rendered inline in the
 * thread's message log. Emitted by the SDK / subprocess transport via
 * `StreamDelta { type: 'compact-boundary' }` when the underlying agent
 * auto-compacted prior context; surfaces a visible "history was rewritten"
 * marker so the user can tell that messages above the divider may no longer
 * be in the model's working set. Codex P2 on PR #379.
 *
 * Lives in a per-thread map separate from `ChatMessage` so the existing
 * `role: 'user' | 'assistant'` discriminator stays untouched.
 */
export interface CompactBoundaryNoticeDto {
	/** Stable id used as `:key` in lists. UUID v4 from `crypto.randomUUID()`. */
	readonly id: string;
	/** Thread the boundary belongs to. */
	readonly threadId: string;
	/** ISO 8601 UTC timestamp recorded when the delta was received. */
	readonly createdAt: string;
	/**
	 * Optional reason string forwarded from the SDK
	 * (`SDKCompactBoundaryMessage`). May be undefined; the UI falls back to
	 * the generic i18n notice when missing.
	 */
	readonly reason?: string;
}

/**
 * Plain DTO stored in Pinia. Does NOT include file content — content is
 * loaded on-demand at send time via VaultPort.readFile(). Satisfies D-CCS-005.
 */
export interface ContextFileEntry {
	/** Vault-relative path, e.g. "specs/my-feature/requirements.md". Used as unique key. */
	readonly path: string;
	/** Display name shown in the chip, e.g. "requirements.md". */
	readonly label: string;
	/**
	 * True if this entry was added automatically from the active Obsidian
	 * editor file. Auto entries: (1) have no remove control, (2) are always
	 * placed first in the list, (3) are replaced as a unit when the active
	 * file changes.
	 */
	readonly isAuto: boolean;
}

/**
 * Status of the chat panel's request lifecycle.
 *   idle    — no request in flight, panel ready for input
 *   loading — request sent, awaiting response
 *   error   — last request ended in failure (timeout or query error)
 */
export type ChatStatus = 'idle' | 'loading' | 'error';

/**
 * Subset of ChatTransportErrorCode values that the store tracks for UI rendering.
 * Only timeout and query_failed appear as error states in the panel;
 * NOT_INSTALLED and API_KEY_MISSING are handled at the availability-check
 * level.
 */
export type ChatErrorType = 'timeout' | 'query_failed';

/**
 * Pinia store for the chat-panel UI surface plus the per-thread message log
 * (Arch review #4, WP-3 split of the former monolithic `chatStore`).
 *
 * Owns the slots that describe the **current chat panel** (context files,
 * user text, last response, request status/errorType/truncated/structuredFail
 * banner) and the **per-thread message log + compact-boundary notices**. These
 * all reset together on "New conversation" — coupling them in one store
 * avoids forcing every consumer to depend on three stores for what is really
 * one chat-panel concern.
 *
 * Does NOT own thread persistence (`chatThreadsStore`), per-turn streaming
 * (`streamingTurnStore`), or file-write proposals (`proposalStore`).
 *
 * Satisfies REQ-CCS-005, REQ-CCS-006, REQ-CCS-009, REQ-CCS-010, REQ-CCS-013,
 * REQ-CCS-014, REQ-CCS-016, REQ-ASM-025, REQ-ASM-040, SPEC-CCS-001 §4,
 * IDEA-ASV-001, Codex P2 on PR #369 (structuredFail residency).
 */
export const useMessagesStore = defineStore('messages', () => {
	/**
	 * Ordered list of context files. Auto entry (isAuto: true) always
	 * occupies index 0 when present. Manual entries follow in insertion
	 * order.
	 */
	const contextFiles = ref<ContextFileEntry[]>([]);

	/**
	 * Current value of the textarea. Bound via v-model to ChatInput. Reset
	 * to '' after a successful response. Retained on timeout or query error.
	 */
	const userText = ref<string>('');

	/**
	 * The last successful response text from Claude. Null until the first
	 * success. Cleared when a new request begins (beginRequest).
	 */
	const response = ref<string | null>(null);

	/** Current lifecycle state of the chat panel. */
	const status = ref<ChatStatus>('idle');

	/**
	 * When status === 'error', identifies the specific error type. Null when
	 * status is 'idle' or 'loading'.
	 */
	const errorType = ref<ChatErrorType | null>(null);

	/**
	 * True if the last buildPrompt() call truncated content to stay within
	 * the cap. Cleared by beginRequest(). Drives trim notice in ChatResponse.
	 */
	const truncated = ref<boolean>(false);

	/**
	 * Structured-output parse-failure flag (REQ-ASM-025). Set by
	 * `ChatSidebar` when `queryStructured()` returns an `EnvelopeParseError`;
	 * surfaced via `ChatResponse` state `'structured-fail'`. Lives in the
	 * store (not in `ChatSidebar.vue` component-local state) so the agent
	 * sidepanel's "New conversation" handler can reset it — Codex P2
	 * finding on PR #369: without store residency the banner persisted
	 * across a thread reset because `ChatSidebar` is never remounted.
	 */
	const structuredFail = ref<boolean>(false);

	/**
	 * Per-thread in-memory message log (IDEA-ASV-001, agent-sidepanel-v2
	 * Increment 2). Drives the multi-turn `MessageList.vue` rendering in
	 * the dedicated agent sidepanel. Memory-only: thread metadata persists
	 * across restarts via `chatThreadsStore.chatThreads`, but full message
	 * bodies do not — the vault session log is the canonical mirror
	 * (REQ-ASM-040).
	 */
	const messages = ref<Map<string, ChatMessage[]>>(new Map());

	/**
	 * Per-thread synthetic `compact-boundary` notices, keyed by `threadId`.
	 * Each entry marks the point where the SDK auto-compacted prior context
	 * (StreamDelta `compact-boundary`). Rendered inline by `MessageList.vue`
	 * so users see when conversation history may have been rewritten.
	 * Memory-only — boundaries are not persisted across restarts because
	 * the vault session log already captures the underlying SDK event.
	 * Codex P2 on PR #379.
	 */
	const compactBoundaries = ref<Map<string, CompactBoundaryNoticeDto[]>>(new Map());

	// ── Context-file actions ─────────────────────────────────────────────

	/**
	 * Appends a file to contextFiles. No-op if a file with the same path
	 * already exists (REQ-CCS-009). Auto files should use setActiveFile
	 * instead.
	 */
	function addContextFile(file: ContextFileEntry): void {
		if (contextFiles.value.some((f) => f.path === file.path)) return;
		contextFiles.value.push(file);
	}

	/** Removes the entry whose path matches. No-op if not found. */
	function removeContextFile(path: string): void {
		contextFiles.value = contextFiles.value.filter((f) => f.path !== path);
	}

	/**
	 * Replaces the auto slot (REQ-CCS-005, REQ-CCS-006). If file is non-null,
	 * forces isAuto=true, removes any existing auto entry, then inserts it
	 * at index 0. If file is null, removes any existing auto entry. Manual
	 * entries are NEVER mutated — focusing a file that's already manually
	 * pinned does not delete the manual entry; the manual stays in state so
	 * it resurfaces when the auto slot moves away. Duplicate-display /
	 * duplicate-prompt-body concerns are handled at the read site via
	 * `effectiveContextFiles` (Codex P2 follow-up, PR #351).
	 */
	function setActiveFile(file: ContextFileEntry | null): void {
		const manuals = contextFiles.value.filter((f) => !f.isAuto);
		if (file === null) {
			contextFiles.value = manuals;
		} else {
			const entry: ContextFileEntry = { ...file, isAuto: true };
			contextFiles.value = [entry, ...manuals];
		}
	}

	// ── Input + request-lifecycle actions ────────────────────────────────

	/** Sets userText. */
	function setUserText(text: string): void {
		userText.value = text;
	}

	/**
	 * Sets status='loading', clears response, errorType, truncated.
	 * Satisfies REQ-CCS-014.
	 */
	function beginRequest(): void {
		status.value = 'loading';
		response.value = null;
		errorType.value = null;
		truncated.value = false;
	}

	/**
	 * Sets status='idle', stores text and truncated flag.
	 * Satisfies REQ-CCS-013 success path.
	 */
	function setResponse(text: string, wasTruncated: boolean): void {
		status.value = 'idle';
		response.value = text;
		truncated.value = wasTruncated;
	}

	/**
	 * Sets status='error', stores errorType, clears response.
	 * Satisfies REQ-CCS-016.
	 */
	function setError(type: ChatErrorType): void {
		status.value = 'error';
		errorType.value = type;
		response.value = null;
	}

	/** Clears response and resets to idle. */
	function clearResponse(): void {
		response.value = null;
		status.value = 'idle';
		errorType.value = null;
		truncated.value = false;
		structuredFail.value = false;
	}

	/**
	 * Sets the structured-output parse-failure flag (REQ-ASM-025). Surfaced
	 * via `ChatResponse` state `'structured-fail'`. Cleared by
	 * `clearResponse()`, `reset()`, and on every new send in
	 * `ChatSidebar.handleSend`.
	 */
	function setStructuredFail(value: boolean): void {
		structuredFail.value = value;
	}

	// ── Per-thread message log + compact-boundary notices ────────────────

	/**
	 * Appends a single `ChatMessage` to the per-thread message log. Creates
	 * the bucket lazily for unseen `threadId`s. Idempotent on `id` collision
	 * (a second append with the same id is a no-op) so retries cannot
	 * double-record. IDEA-ASV-001 (agent-sidepanel-v2 Increment 2).
	 */
	function appendMessage(message: ChatMessage): void {
		const bucket = messages.value.get(message.threadId) ?? [];
		if (bucket.some((m) => m.id === message.id)) return;
		const next = new Map(messages.value);
		next.set(message.threadId, [...bucket, message]);
		messages.value = next;
	}

	/**
	 * Removes the latest assistant message from the named thread's bucket
	 * (REQ-MPS-027). No-op when the thread has no messages or when the trailing
	 * message is not an assistant turn. Used by the Regenerate per-message
	 * action in `ChatSidebar`: drop the stale assistant reply before
	 * re-dispatching the same prompt. Spec: WS-7 §8.3.
	 */
	function removeLatestAssistant(threadId: string): void {
		const bucket = messages.value.get(threadId);
		if (bucket === undefined || bucket.length === 0) return;
		const tail = bucket[bucket.length - 1];
		if (tail?.role !== 'assistant') return;
		const next = new Map(messages.value);
		next.set(threadId, bucket.slice(0, -1));
		messages.value = next;
	}

	/**
	 * Drops every message strictly after `index` in the named thread's bucket
	 * (REQ-MPS-028). Index is preserved — the message AT `index` stays.
	 * No-op when the thread has no messages or when `index` already points at
	 * or past the last entry. Used by the Edit per-message action: when the
	 * user edits a previous user turn, every later message becomes stale and
	 * must be cleared before the new turn is dispatched. Spec: WS-7 §8.3.
	 */
	function truncateAfter(threadId: string, index: number): void {
		const bucket = messages.value.get(threadId);
		if (bucket === undefined || bucket.length === 0) return;
		if (index < 0) return;
		if (index >= bucket.length - 1) return;
		const next = new Map(messages.value);
		next.set(threadId, bucket.slice(0, index + 1));
		messages.value = next;
	}

	/**
	 * Drops every message AND compact-boundary notice for the given thread.
	 * Called by the "New conversation" action in the sidepanel header when
	 * the user closes out a thread context — Increment 2 retains the
	 * `ChatThreadRecord` (transport + session_id continuity) but starts the
	 * visible log fresh.
	 */
	function clearThreadMessages(threadId: string): void {
		if (messages.value.has(threadId)) {
			const next = new Map(messages.value);
			next.delete(threadId);
			messages.value = next;
		}
		if (compactBoundaries.value.has(threadId)) {
			const next = new Map(compactBoundaries.value);
			next.delete(threadId);
			compactBoundaries.value = next;
		}
	}

	/**
	 * Append a `compact-boundary` notice to the active thread's notice log.
	 * Idempotent on `id` collision. Creates the bucket lazily for unseen
	 * thread ids. Used by `ChatSidebar.applyNonTerminalDelta` when the
	 * transport emits a `StreamDelta { type: 'compact-boundary' }` so that
	 * `MessageList.vue` can render the divider inline with the conversation.
	 * Codex P2 on PR #379.
	 */
	function appendCompactBoundaryNotice(
		threadId: string,
		payload: { reason?: string },
	): void {
		const bucket = compactBoundaries.value.get(threadId) ?? [];
		const entry: CompactBoundaryNoticeDto = {
			id:
				typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
					? crypto.randomUUID()
					: `cb-${Date.now()}-${Math.random().toString(36).slice(2)}`,
			threadId,
			createdAt: new Date().toISOString(),
			reason: payload.reason,
		};
		const next = new Map(compactBoundaries.value);
		next.set(threadId, [...bucket, entry]);
		compactBoundaries.value = next;
	}

	/**
	 * Path-deduped view of `contextFiles`. When the same vault path appears
	 * in both the auto slot and a manual entry (the user focused a file they
	 * had already pinned), the auto entry wins and the manual entry is
	 * hidden — one chip, one prompt-body inclusion. The manual entry stays
	 * in `contextFiles` so it resurfaces when the auto slot moves to a
	 * different file or is cleared (Codex P2 follow-up, PR #351).
	 *
	 * Consumers that drive prompt assembly or chip rendering should read
	 * this computed rather than `contextFiles` directly.
	 */
	const effectiveContextFiles = computed<readonly ContextFileEntry[]>(() => {
		const seen = new Set<string>();
		const out: ContextFileEntry[] = [];
		for (const entry of contextFiles.value) {
			if (seen.has(entry.path)) continue;
			seen.add(entry.path);
			out.push(entry);
		}
		return out;
	});

	/**
	 * Full wipe. Used by `useChatReset.resetAll()` and by test fixtures.
	 * Pinia's default `$reset` does not restore Maps, hence the explicit
	 * action. Does not touch the other three stores.
	 */
	function reset(): void {
		contextFiles.value = [];
		userText.value = '';
		response.value = null;
		status.value = 'idle';
		errorType.value = null;
		truncated.value = false;
		structuredFail.value = false;
		messages.value = new Map();
		compactBoundaries.value = new Map();
	}

	return {
		contextFiles,
		effectiveContextFiles,
		userText,
		response,
		status,
		errorType,
		truncated,
		structuredFail,
		messages,
		compactBoundaries,
		addContextFile,
		removeContextFile,
		setActiveFile,
		setUserText,
		beginRequest,
		setResponse,
		setError,
		clearResponse,
		setStructuredFail,
		appendMessage,
		removeLatestAssistant,
		truncateAfter,
		clearThreadMessages,
		appendCompactBoundaryNotice,
		reset,
	};
});
