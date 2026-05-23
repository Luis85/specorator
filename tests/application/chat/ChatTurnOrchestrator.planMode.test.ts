/**
 * T-MPS-110 — `ChatTurnOrchestrator` threads `planMode` from `TurnInput` into
 * `ChatTransportStreamOptions`.
 *
 * Satisfies REQ-MPS-037, TST-MPS-23.
 */
import { describe, it, expect, vi } from 'vitest';
import { MockBridge } from '@/infrastructure/mock/MockBridge';
import { MockClaudeCliPort } from '@/infrastructure/mock/MockClaudeCliPort';
import type { LoggerPort } from '@/domain/ports/LoggerPort';
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

function fakeLogger(): LoggerPort {
	return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function fakeMessages(): MessagesPort {
	return {
		beginRequest: vi.fn(),
		setResponse: vi.fn(),
		setError: vi.fn(),
		setUserText: vi.fn(),
		setStructuredFail: vi.fn(),
		appendMessage: vi.fn(),
		clearThreadMessages: vi.fn(),
		appendCompactBoundaryNotice: vi.fn(),
	};
}

function fakeThreads(): ThreadsPort {
	return {
		chatThreads: new Map(),
		upsertThread: vi.fn(),
		setActiveThreadId: vi.fn(),
		captureSessionId: vi.fn(),
		clearSessionId: vi.fn(),
		markThreadUsed: vi.fn(),
	};
}

function fakeStreaming(): StreamingPort {
	return {
		resetStreaming: vi.fn(),
		setCliStartingUp: vi.fn(),
		setSessionResumed: vi.fn(),
		appendStreamingDelta: vi.fn(),
		appendStreamingThinking: vi.fn(),
		startStreamingToolCall: vi.fn(),
		appendStreamingToolCallInput: vi.fn(),
		finishStreamingToolCall: vi.fn(),
		setLastUsage: vi.fn(),
	};
}

function fakeProposals(): ProposalsPort {
	return { addProposal: vi.fn(), clearThreadProposals: vi.fn() };
}

function makeWriter(): SessionLogWriter {
	return {
		appendUserAssistant: vi.fn().mockResolvedValue(undefined),
		appendProposalDecision: vi.fn().mockResolvedValue(undefined),
	} as unknown as SessionLogWriter;
}

function turnInput(overrides: Partial<TurnInput> = {}): TurnInput {
	return {
		userMessage: 'hi',
		prompt: 'hi',
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

function makeOrchestrator(port: MockClaudeCliPort) {
	const bridge = new MockBridge();
	vi.spyOn(bridge, 'getSettings').mockResolvedValue({ ...DEFAULT_SETTINGS });
	let seq = 1;
	return new ChatTurnOrchestrator({
		claudeCliPort: port,
		settings: bridge,
		vault: bridge,
		logger: fakeLogger(),
		messages: fakeMessages(),
		threads: fakeThreads(),
		streaming: fakeStreaming(),
		proposals: fakeProposals(),
		getSessionLogWriter: async () => makeWriter(),
		nowIso: () => '2025-01-01T00:00:00.000Z',
		randomId: () => `id-${seq++}`,
		abortControllerFactory: () => new AbortController(),
	});
}

describe('ChatTurnOrchestrator — planMode forwarding', () => {
	it('REQ-MPS-037: planMode=true is forwarded to ChatTransportStreamOptions.planMode', async () => {
		const port = new MockClaudeCliPort();
		port.available = true;
		port.cannedResponse = '';
		const orchestrator = makeOrchestrator(port);
		await orchestrator.sendTurn(turnInput({ planMode: true }));
		const opts = port.optionsLog[port.optionsLog.length - 1];
		expect(opts).toBeDefined();
		expect(opts?.planMode).toBe(true);
	});

	it('REQ-MPS-037: planMode=false (default) does not set planMode on options', async () => {
		const port = new MockClaudeCliPort();
		port.available = true;
		port.cannedResponse = '';
		const orchestrator = makeOrchestrator(port);
		await orchestrator.sendTurn(turnInput());
		const opts = port.optionsLog[port.optionsLog.length - 1];
		expect(opts?.planMode).toBeUndefined();
	});
});
