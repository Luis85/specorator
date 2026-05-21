/**
 * T-MPS-111 — When the `TurnInput.userMessage` starts with `#`, the
 * orchestrator routes the body after `#` into `systemPromptSuffix` instead
 * of sending it as a regular prompt.
 *
 * Satisfies REQ-MPS-039, TST-MPS-25.
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

function makeOrchestrator(port: MockClaudeCliPort) {
	const bridge = new MockBridge();
	vi.spyOn(bridge, 'getSettings').mockResolvedValue({ ...DEFAULT_SETTINGS });
	let seq = 1;
	const messages: MessagesPort = {
		beginRequest: vi.fn(),
		setResponse: vi.fn(),
		setError: vi.fn(),
		setUserText: vi.fn(),
		setStructuredFail: vi.fn(),
		appendMessage: vi.fn(),
		clearThreadMessages: vi.fn(),
		appendCompactBoundaryNotice: vi.fn(),
	};
	const threads: ThreadsPort = {
		chatThreads: new Map(),
		upsertThread: vi.fn(),
		setActiveThreadId: vi.fn(),
		captureSessionId: vi.fn(),
		markThreadUsed: vi.fn(),
	};
	const streaming: StreamingPort = {
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
	const proposals: ProposalsPort = {
		addProposal: vi.fn(),
		clearThreadProposals: vi.fn(),
	};
	const writer: SessionLogWriter = {
		appendUserAssistant: vi.fn().mockResolvedValue(undefined),
		appendProposalDecision: vi.fn().mockResolvedValue(undefined),
	} as unknown as SessionLogWriter;
	return new ChatTurnOrchestrator({
		claudeCliPort: port,
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

describe('ChatTurnOrchestrator — instructionMode forwarding (`#`)', () => {
	it('REQ-MPS-039: `instructionSuffix` on TurnInput is forwarded as systemPromptSuffix', async () => {
		const port = new MockClaudeCliPort();
		port.available = true;
		port.cannedResponse = '';
		const orchestrator = makeOrchestrator(port);
		await orchestrator.sendTurn(
			turnInput({ instructionSuffix: 'be concise', systemPromptSuffix: '' }),
		);
		const opts = port.optionsLog[port.optionsLog.length - 1];
		expect(opts?.systemPromptSuffix).toContain('be concise');
	});

	it('appends instructionSuffix to an existing systemPromptSuffix', async () => {
		const port = new MockClaudeCliPort();
		port.available = true;
		port.cannedResponse = '';
		const orchestrator = makeOrchestrator(port);
		await orchestrator.sendTurn(
			turnInput({
				systemPromptSuffix: 'Stage: idea.',
				instructionSuffix: 'be concise',
			}),
		);
		const opts = port.optionsLog[port.optionsLog.length - 1];
		expect(opts?.systemPromptSuffix).toContain('Stage: idea.');
		expect(opts?.systemPromptSuffix).toContain('be concise');
	});
});
