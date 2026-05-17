import { useChatThreadsStore } from '@/ui/stores/chatThreadsStore';
import { useMessagesStore } from '@/ui/stores/messagesStore';
import { useProposalStore } from '@/ui/stores/proposalStore';
import { useStreamingTurnStore } from '@/ui/stores/streamingTurnStore';

/**
 * Composable that orchestrates the cross-store "new conversation" reset.
 * Single source of truth for the four-store sequence that used to live as
 * an ad-hoc sequence of calls inside `AgentSidepanelRoot.handleNewConversation`
 * — that previous sequence forgot to call `resetStreaming()`, leaving
 * residual mid-stream state across thread rotations (UX review #15).
 *
 * The split into four narrow stores (Arch review #4, WP-3) made the omission
 * easy to miss. Routing every "new conversation" path through this composable
 * eliminates that class of regression — and the bundled test
 * (`tests/ui/composables/useChatReset.test.ts`) pins the invariant.
 */
export function useChatReset(): {
	resetForNewConversation: (previousThreadId: string | null) => void;
	resetAll: () => void;
} {
	const threads = useChatThreadsStore();
	const streaming = useStreamingTurnStore();
	const proposals = useProposalStore();
	const messages = useMessagesStore();

	/**
	 * Drops every per-thread + per-turn slot that belongs to a closed-out
	 * conversation. The order is intentional:
	 *   1. proposals (so any pending Accept/Reject UI tied to the previous
	 *      thread disappears first — Codex P2 on PR #369, fourth review),
	 *   2. messages + compact-boundaries for the previous thread,
	 *   3. streaming-turn slots (closes UX review #15 — `streamingText` and
	 *      friends were leaking across "new conversation"),
	 *   4. chat-panel I/O (response, structuredFail, userText),
	 *   5. active thread id cleared last so any subscriber that re-reads
	 *      after the reset sees a coherent "nothing selected" state.
	 *
	 * `previousThreadId === null` skips the per-thread evictions and only
	 * runs the global (streaming + I/O) wipe — covers the case where the
	 * caller hits "New conversation" with no active thread already.
	 */
	function resetForNewConversation(previousThreadId: string | null): void {
		if (previousThreadId !== null) {
			proposals.clearThreadProposals(previousThreadId);
			messages.clearThreadMessages(previousThreadId);
		}
		streaming.resetStreaming();
		messages.clearResponse();
		messages.setUserText('');
		threads.setActiveThreadId(null);
	}

	/**
	 * Test-fixture full wipe — drops every slot from every store across all
	 * four chat stores. Production code should prefer
	 * `resetForNewConversation` so persisted-thread metadata survives.
	 */
	function resetAll(): void {
		proposals.reset();
		messages.reset();
		streaming.reset();
		threads.reset();
	}

	return { resetForNewConversation, resetAll };
}
