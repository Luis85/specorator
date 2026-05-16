import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import type { ChatThreadRecord } from '@/domain/chat/ChatThreadRecord';
import type { ChatMessage } from '@/domain/chat/ChatMessage';
import type { SessionId } from '@/domain/chat/SessionId';
import type {
	FileWriteProposal,
	FileWriteProposalStatus,
} from '@/application/chat/FileWriteProposal';
import type { CommitProposalErrorCode } from '@/application/chat/errors';

/**
 * Plain DTO stored in Pinia. Does NOT include file content — content is loaded
 * on-demand at send time via VaultPort.readFile(). Satisfies D-CCS-005.
 */
export interface ContextFileEntry {
	/** Vault-relative path, e.g. "specs/my-feature/requirements.md". Used as unique key. */
	readonly path: string;
	/** Display name shown in the chip, e.g. "requirements.md". */
	readonly label: string;
	/**
	 * True if this entry was added automatically from the active Obsidian editor file.
	 * Auto entries: (1) have no remove control, (2) are always placed first in the list,
	 * (3) are replaced as a unit when the active file changes.
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
 * Subset of ClaudeCliErrorCode values that the store tracks for UI rendering.
 * Only timeout and query_failed appear as error states in the panel;
 * NOT_INSTALLED and API_KEY_MISSING are handled at the availability-check level.
 */
export type ChatErrorType = 'timeout' | 'query_failed';

/**
 * Pinia store for the chat sidebar panel.
 * State holds DTOs only — no domain class instances, no file content in state.
 * Satisfies REQ-CCS-005, REQ-CCS-006, REQ-CCS-009, REQ-CCS-010,
 * REQ-CCS-013, REQ-CCS-014, REQ-CCS-016, SPEC-CCS-001 §4,
 * and SPEC-ASM-001 §8.1 (REQ-ASM-031, REQ-ASM-035, REQ-ASM-037, REQ-ASM-041).
 */
export const useChatStore = defineStore('chat', () => {
	/**
	 * Ordered list of context files. Auto entry (isAuto: true) always occupies index 0
	 * when present. Manual entries follow in insertion order.
	 */
	const contextFiles = ref<ContextFileEntry[]>([]);

	/**
	 * Current value of the textarea. Bound via v-model to ChatInput.
	 * Reset to '' after a successful response. Retained on timeout or query error.
	 */
	const userText = ref<string>('');

	/**
	 * The last successful response text from Claude. Null until the first success.
	 * Cleared when a new request begins (beginRequest).
	 */
	const response = ref<string | null>(null);

	/**
	 * Current lifecycle state of the chat panel.
	 */
	const status = ref<ChatStatus>('idle');

	/**
	 * When status === 'error', identifies the specific error type.
	 * Null when status is 'idle' or 'loading'.
	 */
	const errorType = ref<ChatErrorType | null>(null);

	/**
	 * True if the last buildPrompt() call truncated content to stay within the cap.
	 * Cleared by beginRequest(). Drives trim notice in ChatResponse.
	 */
	const truncated = ref<boolean>(false);

	// ── ASM additions (SPEC-ASM-001 §8.1) ────────────────────────────────────

	/**
	 * All known chat threads, keyed by `threadId`. Hydrated from
	 * `_storedData.specorator.chatThreads` at view mount (SPEC §9.3) and
	 * mutated by `upsertThread` / `captureSessionId` / `markThreadUsed`.
	 * REQ-ASM-037.
	 */
	const chatThreads = ref<Map<string, ChatThreadRecord>>(new Map());

	/**
	 * `threadId` of the thread the user is currently viewing, or `null` when no
	 * thread is selected. REQ-ASM-031.
	 */
	const activeThreadId = ref<string | null>(null);

	/**
	 * Unresolved or recently-decided file-write proposals, keyed by
	 * `proposalId`. REQ-ASM-041.
	 */
	const proposals = ref<Map<string, FileWriteProposal>>(new Map());

	/**
	 * Accumulated `stream_event` deltas from the active turn. Cleared by
	 * `resetStreaming()` between turns. NFR-ASM-002.
	 */
	const streamingText = ref<string>('');

	/**
	 * `true` while the subprocess adapter is performing first-run startup;
	 * drives `SubprocessStartingPill`. R-ASM-003.
	 */
	const cliStartingUp = ref<boolean>(false);

	/**
	 * `true` for the duration of the first turn after the subprocess adapter
	 * resumes a stored session id; drives `SessionResumeIndicator`. REQ-ASM-035.
	 */
	const sessionResumed = ref<boolean>(false);

	/**
	 * Per-thread in-memory message log (IDEA-ASV-001, agent-sidepanel-v2
	 * Increment 2). Drives the multi-turn `MessageList.vue` rendering in the
	 * dedicated agent sidepanel. Memory-only: thread metadata persists across
	 * restarts via `chatThreads`, but full message bodies do not — the vault
	 * session log is the canonical mirror (REQ-ASM-040).
	 */
	const messages = ref<Map<string, ChatMessage[]>>(new Map());

	/**
	 * Structured-output parse-failure flag (REQ-ASM-025). Set by `ChatSidebar`
	 * when `queryStructured()` returns an `EnvelopeParseError`; surfaced via
	 * `ChatResponse` state `'structured-fail'`. Lives in the store (not in
	 * `ChatSidebar.vue` component-local state) so the agent sidepanel's
	 * "New conversation" handler can reset it — Codex P2 finding on PR #369:
	 * without store residency the banner persisted across a thread reset
	 * because `ChatSidebar` is never remounted.
	 */
	const structuredFail = ref<boolean>(false);

	// ── Actions ──────────────────────────────────────────────────────────────

	/**
	 * Appends a file to contextFiles. No-op if a file with the same path already
	 * exists (REQ-CCS-009). Auto files should use setActiveFile instead.
	 */
	function addContextFile(file: ContextFileEntry): void {
		if (contextFiles.value.some((f) => f.path === file.path)) return;
		contextFiles.value.push(file);
	}

	/**
	 * Removes the entry whose path matches. No-op if not found.
	 */
	function removeContextFile(path: string): void {
		contextFiles.value = contextFiles.value.filter((f) => f.path !== path);
	}

	/**
	 * Replaces the auto slot (REQ-CCS-005, REQ-CCS-006).
	 * If file is non-null, forces isAuto=true, removes any existing auto entry,
	 * then inserts it at index 0.
	 * If file is null, removes any existing auto entry.
	 * Manual entries are NEVER mutated — focusing a file that's already manually
	 * pinned does not delete the manual entry; the manual stays in state so it
	 * resurfaces when the auto slot moves away. Duplicate-display / duplicate-
	 * prompt-body concerns are handled at the read site via `effectiveContextFiles`
	 * (Codex P2 follow-up, PR #351).
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
	 * Sets the structured-output parse-failure flag (REQ-ASM-025). Surfaced via
	 * `ChatResponse` state `'structured-fail'`. Cleared by `clearResponse()`,
	 * `reset()`, and on every new send in `ChatSidebar.handleSend`.
	 */
	function setStructuredFail(value: boolean): void {
		structuredFail.value = value;
	}

	/** Resets state to initial value. */
	function reset(): void {
		contextFiles.value = [];
		userText.value = '';
		response.value = null;
		status.value = 'idle';
		errorType.value = null;
		truncated.value = false;
		chatThreads.value = new Map();
		activeThreadId.value = null;
		proposals.value = new Map();
		streamingText.value = '';
		cliStartingUp.value = false;
		sessionResumed.value = false;
		messages.value = new Map();
		structuredFail.value = false;
	}

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
	 * Drops every message for the given thread. Called by the
	 * "New conversation" action in the sidepanel header when the user closes
	 * out a thread context — Increment 2 retains the `ChatThreadRecord`
	 * (transport + session_id continuity) but starts the visible log fresh.
	 */
	function clearThreadMessages(threadId: string): void {
		if (!messages.value.has(threadId)) return;
		const next = new Map(messages.value);
		next.delete(threadId);
		messages.value = next;
	}

	// ── ASM actions (SPEC-ASM-001 §8.1) ──────────────────────────────────────

	/**
	 * Adds a new `ChatThreadRecord`, or replaces an existing one with the same
	 * `threadId`. REQ-ASM-037.
	 */
	function upsertThread(record: ChatThreadRecord): void {
		const next = new Map(chatThreads.value);
		next.set(record.threadId, record);
		chatThreads.value = next;
	}

	/**
	 * Switches the active thread. Passing `null` clears the selection. In both
	 * branches the per-thread transient slots (`streamingText`, `sessionResumed`)
	 * are cleared because they describe the previous thread's in-flight turn.
	 * REQ-ASM-031.
	 */
	function setActiveThreadId(threadId: string | null): void {
		activeThreadId.value = threadId;
		streamingText.value = '';
		sessionResumed.value = false;
	}

	/**
	 * Captures the `system/init` session id for an existing thread. No-op if
	 * the thread is unknown — the caller is expected to `upsertThread` first.
	 * REQ-ASM-031, REQ-ASM-037.
	 */
	function captureSessionId(threadId: string, sessionId: SessionId): void {
		const existing = chatThreads.value.get(threadId);
		if (existing === undefined) return;
		const next = new Map(chatThreads.value);
		next.set(threadId, { ...existing, sessionId });
		chatThreads.value = next;
	}

	/**
	 * Bumps `lastUsedAt` on the matching thread to "now" (ISO 8601 UTC). No-op
	 * if the thread is unknown. REQ-ASM-037.
	 */
	function markThreadUsed(threadId: string): void {
		const existing = chatThreads.value.get(threadId);
		if (existing === undefined) return;
		const next = new Map(chatThreads.value);
		next.set(threadId, { ...existing, lastUsedAt: new Date().toISOString() });
		chatThreads.value = next;
	}

	/**
	 * Appends a streaming-text delta. NFR-ASM-002.
	 */
	function appendStreamingDelta(delta: string): void {
		streamingText.value = streamingText.value + delta;
	}

	/**
	 * Clears the streaming-text accumulator and the transient session-resumed
	 * indicator. Called at turn boundaries. NFR-ASM-002, REQ-ASM-035.
	 */
	function resetStreaming(): void {
		streamingText.value = '';
		sessionResumed.value = false;
	}

	/**
	 * Stores a new `FileWriteProposal`. Replaces any prior proposal with the
	 * same `proposalId` (idempotent re-emission is tolerated). REQ-ASM-041.
	 */
	function addProposal(proposal: FileWriteProposal): void {
		const next = new Map(proposals.value);
		next.set(proposal.proposalId, proposal);
		proposals.value = next;
	}

	/**
	 * Transitions a proposal to a new lifecycle status. Stamps `decidedAt` with
	 * "now" for any non-`pending` status. Records `failureReason` only when the
	 * status transitions to `'failed'`; clears it otherwise. No-op if the
	 * proposal is unknown. REQ-ASM-043, REQ-ASM-045.
	 */
	function setProposalStatus(
		proposalId: string,
		nextStatus: FileWriteProposalStatus,
		failureReason?: CommitProposalErrorCode,
	): void {
		const existing = proposals.value.get(proposalId);
		if (existing === undefined) return;
		const decidedAt = nextStatus === 'pending' ? null : new Date().toISOString();
		const next = new Map(proposals.value);
		next.set(proposalId, {
			...existing,
			status: nextStatus,
			decidedAt,
			failureReason: nextStatus === 'failed' ? (failureReason ?? null) : null,
		});
		proposals.value = next;
	}

	/** Sets the subprocess-startup pill flag. R-ASM-003. */
	function setCliStartingUp(value: boolean): void {
		cliStartingUp.value = value;
	}

	/** Sets the session-resumed indicator flag. REQ-ASM-035. */
	function setSessionResumed(value: boolean): void {
		sessionResumed.value = value;
	}

	/**
	 * Path-deduped view of `contextFiles`. When the same vault path appears in
	 * both the auto slot and a manual entry (the user focused a file they had
	 * already pinned), the auto entry wins and the manual entry is hidden —
	 * one chip, one prompt-body inclusion. The manual entry stays in
	 * `contextFiles` so it resurfaces when the auto slot moves to a different
	 * file or is cleared (Codex P2 follow-up, PR #351).
	 *
	 * Consumers that drive prompt assembly or chip rendering should read this
	 * computed rather than `contextFiles` directly.
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

	return {
		contextFiles,
		effectiveContextFiles,
		userText,
		response,
		status,
		errorType,
		truncated,
		chatThreads,
		activeThreadId,
		proposals,
		streamingText,
		cliStartingUp,
		sessionResumed,
		messages,
		structuredFail,
		addContextFile,
		removeContextFile,
		setActiveFile,
		setUserText,
		beginRequest,
		setResponse,
		setError,
		clearResponse,
		reset,
		upsertThread,
		setActiveThreadId,
		captureSessionId,
		markThreadUsed,
		appendStreamingDelta,
		resetStreaming,
		addProposal,
		setProposalStatus,
		setCliStartingUp,
		setSessionResumed,
		appendMessage,
		clearThreadMessages,
		setStructuredFail,
	};
});
