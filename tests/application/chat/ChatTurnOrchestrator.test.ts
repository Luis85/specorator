/**
 * WP-2 — Tests for `ChatTurnOrchestrator.sendTurn()`.
 *
 * The orchestrator extracted from `ChatSidebar.vue` (Arch #1) owns thread
 * rotation, transport-routed dispatch, stream consumption, success/error
 * mutation, proposal handling, and vault-mirror scheduling. Tests cover:
 *
 *   - free-text streaming happy path (text delta + done)
 *   - error path (TIMEOUT / QUERY_FAILED mapping)
 *   - abort handle plumbing
 *   - structured-output happy path (proposal added; assistant message
 *     suppressed — UX-#5)
 *   - structured parse failure → structured-fail flag
 *   - thread rotation: rotate vs reuse
 *   - thread eviction on rotate (message + proposal buckets)
 *   - session-id capture from `session-id` delta
 *   - resumed-turn flash on the streaming store
 *   - cli-unavailable when the port is undefined
 *   - non-text deltas dispatched to the streaming store (thinking,
 *     tool-use, usage, compact-boundary)
 *
 * The orchestrator never mounts Vue — tests pass plain fakes for the four
 * chat stores via the structural ports declared on
 * `ChatTurnOrchestratorDeps`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockBridge } from '@/infrastructure/mock/MockBridge';
import { MockClaudeCliPort } from '@/infrastructure/mock/MockClaudeCliPort';
import { ClaudeCliError } from '@/domain/ports/ClaudeCliPort';
import type { LoggerPort } from '@/domain/ports/LoggerPort';
import type { ChatThreadRecord } from '@/domain/chat/ChatThreadRecord';
import { asSessionId } from '@/domain/chat/SessionId';
import type { FileWriteProposal } from '@/application/chat/FileWriteProposal';
import type { SessionLogWriter } from '@/application/chat/SessionLogWriter';
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings';
import { ChatTurnOrchestrator } from '@/application/chat/ChatTurnOrchestrator';
import type {
	MessagesPort,
	ProposalsPort,
	StreamingPort,
	ThreadsPort,
} from '@/application/chat/ChatTurnOrchestrator';
import type { TurnInput } from '@/application/chat/TurnInput';
import { ChatTurnError } from '@/application/chat/ChatTurnError';

// ── Test fakes ──────────────────────────────────────────────────────────

function fakeLogger(): LoggerPort {
	return {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	};
}

interface MessagesState {
	response: string | null;
	truncated: boolean;
	status: 'idle' | 'loading' | 'error';
	errorType: 'timeout' | 'query_failed' | null;
	structuredFail: boolean;
	userText: string;
	appended: ReadonlyArray<{
		readonly id: string;
		readonly threadId: string;
		readonly role: 'user' | 'assistant';
		readonly text: string;
		readonly createdAt: string;
		readonly truncated?: boolean;
	}>;
	cleared: string[];
	compactBoundaries: Array<{ threadId: string; reason?: string }>;
}

function makeMessagesFake(): MessagesPort & { state: MessagesState } {
	const state: MessagesState = {
		response: null,
		truncated: false,
		status: 'idle',
		errorType: null,
		structuredFail: false,
		userText: '',
		appended: [],
		cleared: [],
		compactBoundaries: [],
	};
	return {
		state,
		beginRequest() {
			state.status = 'loading';
			state.response = null;
			state.errorType = null;
			state.truncated = false;
		},
		setResponse(text, truncated) {
			state.status = 'idle';
			state.response = text;
			state.truncated = truncated;
		},
		setError(type) {
			state.status = 'error';
			state.errorType = type;
			state.response = null;
		},
		setUserText(text) {
			state.userText = text;
		},
		setStructuredFail(value) {
			state.structuredFail = value;
		},
		appendMessage(message) {
			state.appended = [...state.appended, message];
		},
		clearThreadMessages(threadId) {
			state.cleared.push(threadId);
		},
		appendCompactBoundaryNotice(threadId, payload) {
			state.compactBoundaries.push({ threadId, reason: payload.reason });
		},
	};
}

interface ThreadsState {
	chatThreads: Map<string, ChatThreadRecord>;
	activeThreadId: string | null;
	upserted: ChatThreadRecord[];
	captured: Array<{ threadId: string; sessionId: string }>;
	marked: string[];
}

function makeThreadsFake(initial: ReadonlyMap<string, ChatThreadRecord> = new Map()): ThreadsPort & {
	state: ThreadsState;
} {
	const state: ThreadsState = {
		chatThreads: new Map(initial),
		activeThreadId: null,
		upserted: [],
		captured: [],
		marked: [],
	};
	return {
		state,
		get chatThreads() {
			return state.chatThreads;
		},
		upsertThread(record) {
			state.chatThreads.set(record.threadId, record);
			state.upserted.push(record);
		},
		setActiveThreadId(threadId) {
			state.activeThreadId = threadId;
		},
		captureSessionId(threadId, sessionId) {
			state.captured.push({ threadId, sessionId });
			const existing = state.chatThreads.get(threadId);
			if (existing !== undefined) {
				state.chatThreads.set(threadId, { ...existing, sessionId });
			}
		},
		markThreadUsed(threadId) {
			state.marked.push(threadId);
		},
	};
}

interface StreamingState {
	resets: number;
	cliStartingUp: boolean[];
	sessionResumed: boolean[];
	textDeltas: string[];
	thinkingDeltas: string[];
	toolStarts: Array<{ blockId: string; toolName: string; initialJson: string }>;
	toolInputDeltas: Array<{ blockId: string; partial: string }>;
	toolStops: string[];
	usage: Array<{ inputTokens: number; outputTokens: number }>;
}

function makeStreamingFake(): StreamingPort & { state: StreamingState } {
	const state: StreamingState = {
		resets: 0,
		cliStartingUp: [],
		sessionResumed: [],
		textDeltas: [],
		thinkingDeltas: [],
		toolStarts: [],
		toolInputDeltas: [],
		toolStops: [],
		usage: [],
	};
	return {
		state,
		resetStreaming() {
			state.resets++;
		},
		setCliStartingUp(value) {
			state.cliStartingUp.push(value);
		},
		setSessionResumed(value) {
			state.sessionResumed.push(value);
		},
		appendStreamingDelta(delta) {
			state.textDeltas.push(delta);
		},
		appendStreamingThinking(delta) {
			state.thinkingDeltas.push(delta);
		},
		startStreamingToolCall(blockId, toolName, initialJson) {
			state.toolStarts.push({ blockId, toolName, initialJson });
		},
		appendStreamingToolCallInput(blockId, partial) {
			state.toolInputDeltas.push({ blockId, partial });
		},
		finishStreamingToolCall(blockId) {
			state.toolStops.push(blockId);
		},
		setLastUsage(usage) {
			state.usage.push(usage);
		},
	};
}

interface ProposalsState {
	added: FileWriteProposal[];
	clearedThreads: string[];
}

function makeProposalsFake(): ProposalsPort & { state: ProposalsState } {
	const state: ProposalsState = { added: [], clearedThreads: [] };
	return {
		state,
		addProposal(proposal) {
			state.added.push(proposal);
		},
		clearThreadProposals(threadId) {
			state.clearedThreads.push(threadId);
		},
	};
}

function makeWriter(): SessionLogWriter {
	return {
		appendUserAssistant: vi.fn().mockResolvedValue(undefined),
		appendProposalDecision: vi.fn().mockResolvedValue(undefined),
	} as unknown as SessionLogWriter;
}

function freeTextInput(overrides: Partial<TurnInput> = {}): TurnInput {
	return {
		userMessage: 'hello',
		prompt: 'hello',
		truncated: false,
		systemPromptSuffix: '',
		slug: null,
		transport: 'api-key',
		intent: 'free-text',
		thread: { kind: 'rotate', previousThreadId: null },
		transportKindRaw: 'api-key',
		...overrides,
	};
}

function makeOrchestrator(options: {
	port?: MockClaudeCliPort | undefined;
	bridge?: MockBridge;
	writer?: SessionLogWriter;
	threads?: ThreadsPort & { state: ThreadsState };
	messages?: MessagesPort & { state: MessagesState };
	streaming?: StreamingPort & { state: StreamingState };
	proposals?: ProposalsPort & { state: ProposalsState };
	idSeed?: number;
} = {}) {
	const bridge = options.bridge ?? new MockBridge();
	vi.spyOn(bridge, 'getSettings').mockResolvedValue({ ...DEFAULT_SETTINGS });
	const writer = options.writer ?? makeWriter();
	const messages = options.messages ?? makeMessagesFake();
	const threads = options.threads ?? makeThreadsFake();
	const streaming = options.streaming ?? makeStreamingFake();
	const proposals = options.proposals ?? makeProposalsFake();
	let seq = options.idSeed ?? 1;
	const orchestrator = new ChatTurnOrchestrator({
		claudeCliPort: options.port,
		settings: bridge,
		vault: bridge,
		logger: fakeLogger(),
		messages,
		threads,
		streaming,
		proposals,
		getSessionLogWriter: async () => writer,
		nowIso: () => '2025-01-01T00:00:00.000Z',
		randomId: () => `id-${seq++}`,
		abortControllerFactory: () => new AbortController(),
	});
	return { orchestrator, bridge, writer, messages, threads, streaming, proposals };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('ChatTurnOrchestrator.sendTurn', () => {
	beforeEach(() => {
		vi.useRealTimers();
	});

	it('returns ChatTurnError on cli-unavailable when the port is undefined', async () => {
		const { orchestrator, messages } = makeOrchestrator({ port: undefined });
		const result = await orchestrator.sendTurn(freeTextInput());
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toBeInstanceOf(ChatTurnError);
			expect(result.error.code).toBe('cli-unavailable');
		}
		expect(messages.state.status).toBe('error');
		expect(messages.state.errorType).toBe('query_failed');
	});

	it('drives a free-text streaming turn to success and appends user + assistant messages', async () => {
		const port = new MockClaudeCliPort();
		port.available = true;
		port.cannedResponse = 'world';
		const { orchestrator, messages, threads, streaming } = makeOrchestrator({ port });
		const result = await orchestrator.sendTurn(freeTextInput({ userMessage: 'hi' }));
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.kind).toBe('success');
		}
		expect(messages.state.response).toBe('world');
		expect(messages.state.status).toBe('idle');
		expect(messages.state.userText).toBe('');
		// User + assistant messages were appended in that order.
		expect(messages.state.appended).toHaveLength(2);
		expect(messages.state.appended[0].role).toBe('user');
		expect(messages.state.appended[0].text).toBe('hi');
		expect(messages.state.appended[1].role).toBe('assistant');
		expect(messages.state.appended[1].text).toBe('world');
		// Streaming was reset and the cold-spawn pill flipped on then off.
		expect(streaming.state.resets).toBe(1);
		expect(streaming.state.cliStartingUp).toEqual([true, false]);
		// A new thread was minted and marked active + used.
		expect(threads.state.activeThreadId).not.toBeNull();
		expect(threads.state.marked).toHaveLength(1);
	});

	it('surfaces the abort controller through the onAbortController callback', async () => {
		const port = new MockClaudeCliPort();
		port.available = true;
		const { orchestrator } = makeOrchestrator({ port });
		let captured: AbortController | null = null;
		await orchestrator.sendTurn(freeTextInput(), {
			onAbortController: (c) => {
				captured = c;
			},
		});
		expect(captured).not.toBeNull();
	});

	it('maps a TIMEOUT error delta to messages.setError("timeout")', async () => {
		const port = new MockClaudeCliPort();
		port.available = true;
		port.queryError = new ClaudeCliError('TIMEOUT', 'timed out');
		const { orchestrator, messages } = makeOrchestrator({ port });
		const result = await orchestrator.sendTurn(freeTextInput());
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.kind).toBe('transport-error');
		}
		expect(messages.state.status).toBe('error');
		expect(messages.state.errorType).toBe('timeout');
	});

	it('maps non-TIMEOUT error deltas to messages.setError("query_failed")', async () => {
		const port = new MockClaudeCliPort();
		port.available = true;
		port.queryError = new ClaudeCliError('QUERY_FAILED', 'boom');
		const { orchestrator, messages } = makeOrchestrator({ port });
		await orchestrator.sendTurn(freeTextInput());
		expect(messages.state.errorType).toBe('query_failed');
	});

	it('reuses an existing thread when the input carries kind="reuse"', async () => {
		const port = new MockClaudeCliPort();
		port.available = true;
		const existing: ChatThreadRecord = {
			threadId: 'T-existing',
			sessionId: asSessionId('session-X'),
			feature: null,
			logPath: '',
			transport: 'api-key',
			createdAt: '2025-01-01T00:00:00.000Z',
			lastUsedAt: '2025-01-01T00:00:00.000Z',
		};
		const threads = makeThreadsFake(new Map([[existing.threadId, existing]]));
		threads.state.activeThreadId = 'T-existing';
		const { orchestrator, streaming } = makeOrchestrator({ port, threads });
		await orchestrator.sendTurn(
			freeTextInput({
				thread: {
					kind: 'reuse',
					previousThreadId: 'T-existing',
					reuseThreadId: 'T-existing',
					reuseSessionId: asSessionId('session-X'),
				},
			}),
		);
		// No new thread minted.
		expect(threads.state.upserted).toHaveLength(0);
		// Resume flash fired (REQ-ASM-035).
		expect(streaming.state.sessionResumed).toContain(true);
	});

	it('rotates a new thread and evicts the previous thread buckets', async () => {
		const port = new MockClaudeCliPort();
		port.available = true;
		const { orchestrator, messages, proposals, threads } = makeOrchestrator({ port });
		await orchestrator.sendTurn(
			freeTextInput({
				thread: { kind: 'rotate', previousThreadId: 'T-old' },
			}),
		);
		expect(threads.state.upserted).toHaveLength(1);
		expect(messages.state.cleared).toContain('T-old');
		expect(proposals.state.clearedThreads).toContain('T-old');
	});

	it('clears the structured-fail flag and resets streaming on every send', async () => {
		const port = new MockClaudeCliPort();
		port.available = true;
		const messages = makeMessagesFake();
		messages.state.structuredFail = true;
		const streaming = makeStreamingFake();
		const { orchestrator } = makeOrchestrator({ port, messages, streaming });
		await orchestrator.sendTurn(freeTextInput());
		expect(messages.state.structuredFail).toBe(false);
		expect(streaming.state.resets).toBe(1);
	});

	it('dispatches non-text deltas to the streaming store', async () => {
		const port = new MockClaudeCliPort();
		port.available = true;
		// Custom stream: thinking, tool-use sequence, usage, compact-boundary, text, done.
		const customStream = async function* () {
			yield { type: 'thinking' as const, text: 'pondering' };
			yield {
				type: 'tool-use-start' as const,
				blockId: 'B1',
				toolName: 'fs',
				inputJson: '{',
			};
			yield {
				type: 'tool-use-input-delta' as const,
				blockId: 'B1',
				inputJson: '"k":"v"}',
			};
			yield { type: 'tool-use-stop' as const, blockId: 'B1' };
			yield {
				type: 'usage' as const,
				inputTokens: 100,
				outputTokens: 50,
			};
			yield { type: 'compact-boundary' as const, reason: 'auto' };
			yield { type: 'text' as const, text: 'hello' };
			yield { type: 'done' as const };
		};
		port.queryStream = (() => customStream()) as typeof port.queryStream;
		const { orchestrator, streaming, messages } = makeOrchestrator({ port });
		await orchestrator.sendTurn(freeTextInput());
		expect(streaming.state.thinkingDeltas).toContain('pondering');
		expect(streaming.state.toolStarts).toHaveLength(1);
		expect(streaming.state.toolInputDeltas).toHaveLength(1);
		expect(streaming.state.toolStops).toEqual(['B1']);
		expect(streaming.state.usage).toEqual([{ inputTokens: 100, outputTokens: 50 }]);
		expect(messages.state.compactBoundaries).toEqual([
			expect.objectContaining({ reason: 'auto' }),
		]);
		expect(messages.state.response).toBe('hello');
	});

	it('captures session-id deltas onto the active thread', async () => {
		const port = new MockClaudeCliPort();
		port.available = true;
		const customStream = async function* () {
			yield { type: 'session-id' as const, sessionId: asSessionId('session-Y') };
			yield { type: 'text' as const, text: 'hi' };
			yield { type: 'done' as const };
		};
		port.queryStream = (() => customStream()) as typeof port.queryStream;
		const { orchestrator, threads } = makeOrchestrator({ port });
		await orchestrator.sendTurn(freeTextInput());
		expect(threads.state.captured.some((c) => c.sessionId === 'session-Y')).toBe(true);
	});

	it('treats a stream that ends without done or error as query_failed', async () => {
		const port = new MockClaudeCliPort();
		port.available = true;
		const customStream = async function* () {
			yield { type: 'text' as const, text: 'partial' };
			// no terminal delta
		};
		port.queryStream = (() => customStream()) as typeof port.queryStream;
		const { orchestrator, messages } = makeOrchestrator({ port });
		await orchestrator.sendTurn(freeTextInput());
		expect(messages.state.status).toBe('error');
		expect(messages.state.errorType).toBe('query_failed');
	});

	it('treats a thrown async iterator as query_failed', async () => {
		const port = new MockClaudeCliPort();
		port.available = true;
		const customStream = async function* () {
			yield { type: 'text' as const, text: 'hi' };
			throw new Error('iterator exploded');
		};
		port.queryStream = (() => customStream()) as typeof port.queryStream;
		const { orchestrator, messages } = makeOrchestrator({ port });
		await orchestrator.sendTurn(freeTextInput());
		expect(messages.state.status).toBe('error');
		expect(messages.state.errorType).toBe('query_failed');
	});

	it('forwards the assistant turn to SessionLogWriter as a best-effort mirror', async () => {
		const port = new MockClaudeCliPort();
		port.available = true;
		port.cannedResponse = 'response body';
		const writer = makeWriter();
		const { orchestrator } = makeOrchestrator({ port, writer });
		await orchestrator.sendTurn(freeTextInput({ userMessage: 'hi' }));
		// Wait one microtask tick so the fire-and-forget chain runs.
		await Promise.resolve();
		await Promise.resolve();
		expect(writer.appendUserAssistant).toHaveBeenCalledTimes(1);
	});

	describe('structured intent (UX-#5: empty assistant suppression)', () => {
		function makeStructuredPort(envelope: unknown): MockClaudeCliPort {
			const port = new MockClaudeCliPort();
			port.available = true;
			// Tag as subscription-capable so `queryStructured` routes through it.
			(port as unknown as { kind: string }).kind = 'subscription';
			(port as unknown as Record<string, unknown>).runStructured = async () => ({
				ok: true,
				value: {
					result: JSON.stringify(envelope),
					structured_output: envelope,
				},
			});
			return port;
		}

		it('adds a proposal and does NOT append an empty assistant message (UX-#5)', async () => {
			const envelope = {
				action: 'createFile',
				path: 'specs/foo/notes.md',
				content: '# Notes',
			};
			const port = makeStructuredPort(envelope);
			const { orchestrator, messages, proposals } = makeOrchestrator({ port });
			const result = await orchestrator.sendTurn(
				freeTextInput({
					userMessage: '/create-file specs/foo/notes.md',
					intent: 'structured',
				}),
			);
			expect(result.ok).toBe(true);
			expect(proposals.state.added).toHaveLength(1);
			// UX-#5: only the user message is appended; the empty assistant
			// placeholder is skipped because the proposal card is the rendering.
			const roles = messages.state.appended.map((m) => m.role);
			expect(roles).toEqual(['user']);
		});

		it('flips structuredFail on EnvelopeParseError without appending messages', async () => {
			const port = new MockClaudeCliPort();
			port.available = true;
			// Return a payload that fails structured parsing.
			(port as unknown as { kind: string }).kind = 'subscription';
			(port as unknown as Record<string, unknown>).runStructured = async () => ({
				ok: true,
				value: { result: 'not json', structured_output: 'not an object' },
			});
			const { orchestrator, messages, proposals } = makeOrchestrator({ port });
			const result = await orchestrator.sendTurn(
				freeTextInput({
					userMessage: '/create-file x',
					intent: 'structured',
				}),
			);
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value.kind).toBe('structured-parse-fail');
			}
			expect(messages.state.structuredFail).toBe(true);
			expect(proposals.state.added).toHaveLength(0);
			expect(messages.state.appended).toHaveLength(0);
		});

		it('maps a transport-level structured error to messages.setError', async () => {
			const port = new MockClaudeCliPort();
			port.available = true;
			(port as unknown as { kind: string }).kind = 'subscription';
			(port as unknown as Record<string, unknown>).runStructured = async () => ({
				ok: false,
				error: new ClaudeCliError('TIMEOUT', 'structured timed out'),
			});
			const { orchestrator, messages } = makeOrchestrator({ port });
			await orchestrator.sendTurn(
				freeTextInput({ userMessage: '/create x', intent: 'structured' }),
			);
			expect(messages.state.status).toBe('error');
			expect(messages.state.errorType).toBe('timeout');
		});

		it('records path-validation errors against the proposal via consumePathError', async () => {
			const envelope = {
				action: 'createFile',
				path: '../outside-vault.md',
				content: 'evil',
			};
			const port = makeStructuredPort(envelope);
			const { orchestrator, proposals } = makeOrchestrator({ port });
			const result = await orchestrator.sendTurn(
				freeTextInput({
					userMessage: '/create-file ../outside-vault.md',
					intent: 'structured',
				}),
			);
			expect(result.ok).toBe(true);
			expect(proposals.state.added).toHaveLength(1);
			const proposalId = proposals.state.added[0].proposalId;
			const pathError = orchestrator.consumePathError(proposalId);
			expect(pathError).not.toBeNull();
			// Idempotent: a second read drains the slot.
			expect(orchestrator.consumePathError(proposalId)).toBeNull();
		});
	});
});
