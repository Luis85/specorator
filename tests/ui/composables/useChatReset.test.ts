/**
 * Tests for `useChatReset()` — the cross-store "new conversation" orchestrator
 * introduced by WP-3 (Arch review #4 split of the former monolithic
 * `chatStore`).
 *
 * Includes the gap test for the UX review #15 finding:
 * "`streamingText` not reset on `New conversation`." The old
 * `handleNewConversation` in `AgentSidepanelRoot.vue` called
 * `clearThreadMessages` / `clearThreadProposals` / `setActiveThreadId(null)` /
 * `clearResponse` / `setUserText('')` — but NEVER `resetStreaming()`. Routing
 * every "new conversation" path through `useChatReset` eliminates that
 * regression class.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useChatReset } from '@/ui/composables/useChatReset';
import { useChatThreadsStore } from '@/ui/stores/chatThreadsStore';
import { useMessagesStore } from '@/ui/stores/messagesStore';
import { useProposalStore } from '@/ui/stores/proposalStore';
import { useStreamingTurnStore } from '@/ui/stores/streamingTurnStore';
import type { ChatThreadRecord } from '@/domain/chat/ChatThreadRecord';
import type { FileWriteProposal } from '@/application/chat/FileWriteProposal';

function makeThread(threadId: string): ChatThreadRecord {
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
	};
}

function makeProposal(proposalId: string, threadId: string): FileWriteProposal {
	return {
		proposalId,
		threadId,
		envelope: { action: 'createFile', path: `specs/${proposalId}.md`, content: 'x' },
		status: 'pending',
		proposedAt: '2026-05-16T00:00:00Z',
		decidedAt: null,
		failureReason: null,
		originPrompt: '/create',
	};
}

/**
 * Stage every store in the "mid-conversation" state the bug actually
 * reproduces: an active thread, a pending proposal on it, a message bucket
 * for it, mid-stream text/thinking/tool-call/usage, a populated response and
 * userText, AND `structuredFail = true`. The reset must drop ALL of it.
 */
function stageMidConversation(threadId: string): void {
	const threads = useChatThreadsStore();
	const messages = useMessagesStore();
	const proposals = useProposalStore();
	const streaming = useStreamingTurnStore();

	threads.upsertThread(makeThread(threadId));
	threads.setActiveThreadId(threadId);

	messages.appendMessage({
		id: 'm1',
		threadId,
		role: 'user',
		text: 'hi',
		createdAt: '2026-05-16T00:00:00Z',
	});
	messages.appendCompactBoundaryNotice(threadId, { reason: 'auto-compact' });
	messages.setUserText('pending input');
	messages.setResponse('previous response', false);
	messages.setStructuredFail(true);

	proposals.addProposal(makeProposal('p1', threadId));

	streaming.appendStreamingDelta('mid-stream text');
	streaming.appendStreamingThinking('thinking');
	streaming.startStreamingToolCall('b1', 'Bash', '{}');
	streaming.setLastUsage({ inputTokens: 10, outputTokens: 20 });
	streaming.setSessionResumed(true);
}

describe('useChatReset()', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	describe('resetForNewConversation', () => {
		// ── UX review #15 + Testing review F8 gap test ───────────────────
		it('UX-#15: drops streaming state along with thread/proposal/message buckets', () => {
			const threadId = 't-A';
			stageMidConversation(threadId);

			const messages = useMessagesStore();
			const proposals = useProposalStore();
			const streaming = useStreamingTurnStore();
			const threads = useChatThreadsStore();

			// Sanity-check the staged precondition.
			expect(streaming.streamingText).not.toBe('');
			expect(streaming.streamingThinking).not.toBe('');
			expect(streaming.streamingToolCalls.size).toBe(1);
			expect(streaming.lastUsage).not.toBeNull();
			expect(streaming.sessionResumed).toBe(true);
			expect(messages.messages.get(threadId)?.length ?? 0).toBeGreaterThan(0);
			expect(messages.compactBoundaries.get(threadId)?.length ?? 0).toBeGreaterThan(0);
			expect(proposals.proposals.size).toBe(1);
			expect(messages.userText).toBe('pending input');
			expect(messages.response).toBe('previous response');
			expect(messages.structuredFail).toBe(true);
			expect(threads.activeThreadId).toBe(threadId);

			useChatReset().resetForNewConversation(threadId);

			// ── Streaming wiped (UX #15 + Testing F8) ────────────────
			expect(streaming.streamingText).toBe('');
			expect(streaming.streamingThinking).toBe('');
			expect(streaming.streamingToolCalls.size).toBe(0);
			expect(streaming.lastUsage).toBeNull();
			expect(streaming.sessionResumed).toBe(false);

			// ── Per-thread + chat-panel wiped ─────────────────────────
			expect(messages.messages.has(threadId)).toBe(false);
			expect(messages.compactBoundaries.has(threadId)).toBe(false);
			expect(proposals.proposals.size).toBe(0);
			expect(messages.response).toBeNull();
			expect(messages.userText).toBe('');
			expect(messages.structuredFail).toBe(false);
			expect(threads.activeThreadId).toBeNull();
		});

		it('preserves the ChatThreadRecord itself (transport + session_id continuity)', () => {
			stageMidConversation('t-A');
			const threads = useChatThreadsStore();
			useChatReset().resetForNewConversation('t-A');
			// The thread record itself is intentionally retained — the subscription
			// transport may still `--resume <id>` from a future thread switcher
			// (see AgentSidepanelRoot comment).
			expect(threads.chatThreads.has('t-A')).toBe(true);
		});

		it('previousThreadId === null skips per-thread evictions but still wipes streaming + I/O', () => {
			const messages = useMessagesStore();
			const streaming = useStreamingTurnStore();
			const proposals = useProposalStore();

			// Stage SOME thread-scoped buckets that must survive a null-prev reset.
			messages.appendMessage({
				id: 'm1',
				threadId: 't-other',
				role: 'user',
				text: 'hi',
				createdAt: '2026-05-16T00:00:00Z',
			});
			proposals.addProposal(makeProposal('p1', 't-other'));
			// Stage global streaming + I/O state that MUST be wiped.
			streaming.appendStreamingDelta('mid');
			messages.setUserText('pending');
			messages.setResponse('previous', false);

			useChatReset().resetForNewConversation(null);

			// Streaming + chat I/O wiped.
			expect(streaming.streamingText).toBe('');
			expect(messages.userText).toBe('');
			expect(messages.response).toBeNull();
			// Other-thread buckets survive — the caller said "no previous thread".
			expect(messages.messages.get('t-other')).toHaveLength(1);
			expect(proposals.proposals.size).toBe(1);
		});

		it('only evicts proposals scoped to the previous thread', () => {
			const proposals = useProposalStore();
			proposals.addProposal(makeProposal('p1', 't-A'));
			proposals.addProposal(makeProposal('p2', 't-B'));

			useChatReset().resetForNewConversation('t-A');

			expect(proposals.proposals.has('p1')).toBe(false);
			expect(proposals.proposals.has('p2')).toBe(true);
		});
	});

	describe('resetAll', () => {
		it('drops every slot from every store (test-fixture full wipe)', () => {
			stageMidConversation('t-A');
			const threads = useChatThreadsStore();
			const messages = useMessagesStore();
			const proposals = useProposalStore();
			const streaming = useStreamingTurnStore();

			useChatReset().resetAll();

			expect(threads.chatThreads.size).toBe(0);
			expect(threads.activeThreadId).toBeNull();
			expect(messages.messages.size).toBe(0);
			expect(messages.compactBoundaries.size).toBe(0);
			expect(messages.contextFiles).toHaveLength(0);
			expect(messages.userText).toBe('');
			expect(messages.response).toBeNull();
			expect(messages.structuredFail).toBe(false);
			expect(proposals.proposals.size).toBe(0);
			expect(streaming.streamingText).toBe('');
			expect(streaming.streamingThinking).toBe('');
			expect(streaming.streamingToolCalls.size).toBe(0);
			expect(streaming.lastUsage).toBeNull();
			expect(streaming.cliStartingUp).toBe(false);
			expect(streaming.sessionResumed).toBe(false);
		});
	});
});
