/**
 * Test-only facade that combines the four post-WP-3 chat stores into a
 * single object whose property access is forwarded to the right store. The
 * production code addresses each store individually (Arch review #4); this
 * helper exists purely so the older test files that consumed a single
 * `useChatStore()` keep reading naturally without an in-test refactor each
 * time the split landed.
 *
 * New tests should depend on the individual stores directly — see the
 * `tests/ui/stores/*.test.ts` files for examples.
 */
import type { Pinia } from 'pinia';
import { useChatThreadsStore } from '@/ui/stores/chatThreadsStore';
import { useMessagesStore } from '@/ui/stores/messagesStore';
import { useProposalStore } from '@/ui/stores/proposalStore';
import { useStreamingTurnStore } from '@/ui/stores/streamingTurnStore';

const FIELD_OWNER: Partial<Record<string, 'messages' | 'threads' | 'streaming' | 'proposals'>> = {
	// messages
	contextFiles: 'messages',
	effectiveContextFiles: 'messages',
	userText: 'messages',
	response: 'messages',
	status: 'messages',
	errorType: 'messages',
	truncated: 'messages',
	structuredFail: 'messages',
	messages: 'messages',
	compactBoundaries: 'messages',
	addContextFile: 'messages',
	removeContextFile: 'messages',
	setActiveFile: 'messages',
	setUserText: 'messages',
	beginRequest: 'messages',
	setResponse: 'messages',
	setError: 'messages',
	clearResponse: 'messages',
	setStructuredFail: 'messages',
	appendMessage: 'messages',
	clearThreadMessages: 'messages',
	appendCompactBoundaryNotice: 'messages',
	// threads
	chatThreads: 'threads',
	activeThreadId: 'threads',
	upsertThread: 'threads',
	setActiveThreadId: 'threads',
	captureSessionId: 'threads',
	markThreadUsed: 'threads',
	// streaming
	streamingText: 'streaming',
	streamingThinking: 'streaming',
	streamingToolCalls: 'streaming',
	lastUsage: 'streaming',
	cliStartingUp: 'streaming',
	sessionResumed: 'streaming',
	appendStreamingDelta: 'streaming',
	appendStreamingThinking: 'streaming',
	startStreamingToolCall: 'streaming',
	appendStreamingToolCallInput: 'streaming',
	finishStreamingToolCall: 'streaming',
	setLastUsage: 'streaming',
	setCliStartingUp: 'streaming',
	setSessionResumed: 'streaming',
	resetStreaming: 'streaming',
	// proposals
	proposals: 'proposals',
	addProposal: 'proposals',
	setProposalStatus: 'proposals',
	clearThreadProposals: 'proposals',
};

type ChatThreadsStore = ReturnType<typeof useChatThreadsStore>;
type MessagesStore = ReturnType<typeof useMessagesStore>;
type StreamingTurnStore = ReturnType<typeof useStreamingTurnStore>;
type ProposalStore = ReturnType<typeof useProposalStore>;

/**
 * Intersection of the four post-split stores, omitting Pinia internal
 * properties that would conflict with one another (each store has its own
 * `$state`, `$id`, etc.). The Proxy below only forwards the chat-data fields,
 * which are disjoint across the four stores.
 */
export type ChatStoresFacade = Pick<
	MessagesStore,
	| 'contextFiles'
	| 'effectiveContextFiles'
	| 'userText'
	| 'response'
	| 'status'
	| 'errorType'
	| 'truncated'
	| 'structuredFail'
	| 'messages'
	| 'compactBoundaries'
	| 'addContextFile'
	| 'removeContextFile'
	| 'setActiveFile'
	| 'setUserText'
	| 'beginRequest'
	| 'setResponse'
	| 'setError'
	| 'clearResponse'
	| 'setStructuredFail'
	| 'appendMessage'
	| 'clearThreadMessages'
	| 'appendCompactBoundaryNotice'
> &
	Pick<
		ChatThreadsStore,
		'chatThreads' | 'activeThreadId' | 'upsertThread' | 'setActiveThreadId' | 'captureSessionId' | 'markThreadUsed'
	> &
	Pick<
		StreamingTurnStore,
		| 'streamingText'
		| 'streamingThinking'
		| 'streamingToolCalls'
		| 'lastUsage'
		| 'cliStartingUp'
		| 'sessionResumed'
		| 'appendStreamingDelta'
		| 'appendStreamingThinking'
		| 'startStreamingToolCall'
		| 'appendStreamingToolCallInput'
		| 'finishStreamingToolCall'
		| 'setLastUsage'
		| 'setCliStartingUp'
		| 'setSessionResumed'
		| 'resetStreaming'
	> &
	Pick<ProposalStore, 'proposals' | 'addProposal' | 'setProposalStatus' | 'clearThreadProposals'>;


/**
 * Returns a Proxy that forwards property reads to whichever of the four
 * stores actually owns each field. Bound methods stay bound to their owning
 * store. Writes are forwarded too so Vue/Pinia reactivity keeps working.
 *
 * Pass an optional `Pinia` instance for tests that mount a Vue app with a
 * specific Pinia (matches the old `useChatStore(pinia)` overload).
 */
export function getChatStoresFacade(pinia?: Pinia): ChatStoresFacade {
	const messages = pinia !== undefined ? useMessagesStore(pinia) : useMessagesStore();
	const threads = pinia !== undefined ? useChatThreadsStore(pinia) : useChatThreadsStore();
	const streaming = pinia !== undefined ? useStreamingTurnStore(pinia) : useStreamingTurnStore();
	const proposals = pinia !== undefined ? useProposalStore(pinia) : useProposalStore();

	const owners = {
		messages: messages as unknown as Record<string, unknown>,
		threads: threads as unknown as Record<string, unknown>,
		streaming: streaming as unknown as Record<string, unknown>,
		proposals: proposals as unknown as Record<string, unknown>,
	} as const;

	return new Proxy({}, {
		get(_target, prop): unknown {
			if (typeof prop !== 'string') return undefined;
			const ownerKey = FIELD_OWNER[prop];
			if (ownerKey === undefined) return undefined;
			const owner = owners[ownerKey];
			const value = owner[prop];
			return typeof value === 'function'
				? (value as (...args: unknown[]) => unknown).bind(owner)
				: value;
		},
		set(_target, prop, value): boolean {
			if (typeof prop !== 'string') return false;
			const ownerKey = FIELD_OWNER[prop];
			if (ownerKey === undefined) return false;
			const owner = owners[ownerKey];
			owner[prop] = value;
			return true;
		},
		has(_target, prop): boolean {
			return typeof prop === 'string' && prop in FIELD_OWNER;
		},
	}) as unknown as ChatStoresFacade;
}
