/**
 * Tests for `ChatTurnOrchestrator` approval-callback wiring (WS-9, T-MPS-138).
 *
 * Satisfies REQ-MPS-045 / REQ-MPS-046. The orchestrator forwards a per-turn
 * `approveTool` resolver from `sendTurn(input, options)` into the transport
 * port's `ChatTransportStreamOptions.approveTool`. The resolver:
 *
 *   1. consults `approvalRulesStore.findMatching(...)` and auto-resolves
 *      `true` on a hit (no UI; idempotent for the same triple);
 *   2. otherwise publishes a pending request onto a `PendingApprovalsPort`
 *      so the UI (`MessageList` → `ApprovalCard`) can render a card and
 *      call back with the user's decision.
 *
 * The Pinia store from `@/ui/stores/approvalRulesStore` is fakeable as a
 * plain object with the same shape; tests pass that fake directly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockBridge } from '@/infrastructure/mock/MockBridge';
import { MockClaudeCliPort } from '@/infrastructure/mock/MockClaudeCliPort';
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings';
import { ChatTurnOrchestrator } from '@/application/chat/ChatTurnOrchestrator';
import type { TurnInput } from '@/application/chat/TurnInput';
import type { ChatTransportApprovalRequest } from '@/domain/ports/ChatTransportPort';
import type { ApprovalRule } from '@/domain/chat/ApprovalRule';
import type { ProviderId } from '@/domain/chat/ProviderSelection';

// ── Fakes ───────────────────────────────────────────────────────────────

interface PendingPublishCall {
	readonly request: ChatTransportApprovalRequest;
	readonly providerId: ProviderId;
	readonly resolve: (decision: { kind: 'deny' | 'allow-once' | 'always' }) => void;
}

function fakeMessages() {
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

function fakeThreads() {
	const map = new Map();
	return {
		chatThreads: map,
		upsertThread: vi.fn((r) => map.set(r.threadId, r)),
		setActiveThreadId: vi.fn(),
		captureSessionId: vi.fn(),
		markThreadUsed: vi.fn(),
	};
}

function fakeStreaming() {
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

function fakeProposals() {
	return {
		addProposal: vi.fn(),
		clearThreadProposals: vi.fn(),
	};
}

function fakeLogger() {
	return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function freeTextInput(): TurnInput {
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
	};
}

function makeOrchestrator(port: MockClaudeCliPort | undefined) {
	const bridge = new MockBridge();
	vi.spyOn(bridge, 'getSettings').mockResolvedValue({ ...DEFAULT_SETTINGS });
	let seq = 1;
	const orchestrator = new ChatTurnOrchestrator({
		claudeCliPort: port,
		settings: bridge,
		vault: bridge,
		logger: fakeLogger(),
		messages: fakeMessages(),
		threads: fakeThreads(),
		streaming: fakeStreaming(),
		proposals: fakeProposals(),
		getSessionLogWriter: async () =>
			({
				appendUserAssistant: vi.fn().mockResolvedValue(undefined),
				appendProposalDecision: vi.fn().mockResolvedValue(undefined),
			}) as never,
		nowIso: () => '2026-05-21T00:00:00.000Z',
		randomId: () => `id-${seq++}`,
		abortControllerFactory: () => new AbortController(),
	});
	return { orchestrator };
}

describe('ChatTurnOrchestrator — approval-callback wiring (REQ-MPS-045/046)', () => {
	let port: MockClaudeCliPort;

	beforeEach(() => {
		port = new MockClaudeCliPort();
		port.available = true;
	});

	it('forwards `approveTool` from sendTurn options into queryStream options', async () => {
		const { orchestrator } = makeOrchestrator(port);
		const approveTool = vi.fn(async () => true);
		await orchestrator.sendTurn(freeTextInput(), { approveTool });
		expect(port.streamOptionsLog.length).toBe(1);
		const opts = port.streamOptionsLog[0];
		expect(typeof opts?.approveTool).toBe('function');
	});

	it('auto-resolves to true when approvalRulesStore.findMatching returns a rule (no UI prompt)', async () => {
		const matchingRule: ApprovalRule = {
			id: 'r1',
			providerId: 'claude',
			tool: 'Bash',
			scope: 'git',
			createdAt: '2026-05-21T00:00:00.000Z',
		};
		const findMatching = vi.fn().mockReturnValue(matchingRule);
		const publish = vi.fn();

		const { orchestrator } = makeOrchestrator(port);
		await orchestrator.sendTurn(freeTextInput(), {
			approveTool: async (request) =>
				await orchestrator.resolveApproval({
					request,
					providerId: 'claude',
					findMatching,
					publishPending: publish,
				}),
		});
		// Now simulate the adapter calling the forwarded resolver.
		const resolver = port.streamOptionsLog[0]?.approveTool;
		expect(resolver).toBeDefined();
		const decision = await resolver!({
			tool: 'Bash',
			scope: 'git status',
			previewText: null,
		});
		expect(decision).toBe(true);
		expect(findMatching).toHaveBeenCalledWith('claude', 'Bash', 'git status');
		// No UI prompt published when the rule matched.
		expect(publish).not.toHaveBeenCalled();
	});

	it('publishes a pending request to `publishPending` when no rule matches', async () => {
		const findMatching = vi.fn().mockReturnValue(undefined);
		let captured: PendingPublishCall | null = null;
		const publish = vi.fn((call: PendingPublishCall) => {
			captured = call;
		});

		const { orchestrator } = makeOrchestrator(port);
		await orchestrator.sendTurn(freeTextInput(), {
			approveTool: async (request) =>
				await orchestrator.resolveApproval({
					request,
					providerId: 'claude',
					findMatching,
					publishPending: publish,
				}),
		});
		const resolver = port.streamOptionsLog[0]?.approveTool;
		const pending = resolver!({
			tool: 'Write',
			scope: 'src/foo.ts',
			previewText: 'export const foo = 1',
		});
		// The promise stays pending until the UI decides.
		expect(publish).toHaveBeenCalledTimes(1);
		expect(captured).not.toBeNull();
		expect(captured!.request.tool).toBe('Write');
		expect(captured!.request.scope).toBe('src/foo.ts');
		expect(captured!.providerId).toBe('claude');
		// UI decides "allow-once" → resolver resolves true.
		captured!.resolve({ kind: 'allow-once' });
		expect(await pending).toBe(true);
	});

	it('resolves false when UI decides deny', async () => {
		const findMatching = vi.fn().mockReturnValue(undefined);
		let captured: PendingPublishCall | null = null;
		const publish = vi.fn((call: PendingPublishCall) => {
			captured = call;
		});
		const { orchestrator } = makeOrchestrator(port);
		await orchestrator.sendTurn(freeTextInput(), {
			approveTool: async (request) =>
				await orchestrator.resolveApproval({
					request,
					providerId: 'claude',
					findMatching,
					publishPending: publish,
				}),
		});
		const resolver = port.streamOptionsLog[0]?.approveTool;
		const pending = resolver!({ tool: 'Bash', scope: 'rm -rf', previewText: null });
		captured!.resolve({ kind: 'deny' });
		expect(await pending).toBe(false);
	});

	it('resolves true when UI decides always (rule persistence is the card`s job)', async () => {
		const findMatching = vi.fn().mockReturnValue(undefined);
		let captured: PendingPublishCall | null = null;
		const publish = vi.fn((call: PendingPublishCall) => {
			captured = call;
		});
		const { orchestrator } = makeOrchestrator(port);
		await orchestrator.sendTurn(freeTextInput(), {
			approveTool: async (request) =>
				await orchestrator.resolveApproval({
					request,
					providerId: 'claude',
					findMatching,
					publishPending: publish,
				}),
		});
		const resolver = port.streamOptionsLog[0]?.approveTool;
		const pending = resolver!({ tool: 'Bash', scope: 'git', previewText: null });
		captured!.resolve({ kind: 'always' });
		expect(await pending).toBe(true);
	});
});
