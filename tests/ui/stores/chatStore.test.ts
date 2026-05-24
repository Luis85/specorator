/**
 * T-CC-019 (RED) — `chatStore` (Pinia) single-thread state machine + sink actions.
 *
 * SPEC-CC-016 + §6 state machine + EC-1/5/7/8/9/10/15. Plain DTOs only — no domain
 * class instance crosses the store boundary (ADR-003). The store drives a
 * `RunChatTurnUseCase`-shaped runner (`{ run, cancel }`) it is bound to, and surfaces
 * a start-failure via an injected notice callback (the FeedbackService seam — the
 * store never imports obsidian).
 *
 * Traces: REQ-CC-003, 004, 005, 005a, 007, 009, 010, 012.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useChatStore } from '@/ui/stores/chatStore';
import type { ChatTurnSink, RunChatTurnInput } from '@/application/chat/RunChatTurnUseCase';
import { ChatTurnError } from '@/application/chat/RunChatTurnUseCase';
import { ok, err, type Result } from '@/domain/shared/Result';
import type { UsageInfo } from '@/domain/ports';

const USAGE: UsageInfo = {
	inputTokens: 10,
	contextWindow: 200000,
	contextTokens: 50,
	percentage: 0.025,
};

/**
 * A scriptable runner standing in for `RunChatTurnUseCase`: it captures the sink
 * the store hands it so the test can drive the sink legs directly, and lets the
 * test decide the discrete `run` result. `cancel` is spied.
 */
class FakeRunner {
	sink: ChatTurnSink | null = null;
	lastInput: RunChatTurnInput | null = null;
	result: Result<void, ChatTurnError> = ok(undefined);
	runCalls = 0;
	cancel = vi.fn();

	run(input: RunChatTurnInput, sink: ChatTurnSink): Promise<Result<void, ChatTurnError>> {
		this.runCalls += 1;
		this.lastInput = input;
		this.sink = sink;
		return Promise.resolve(this.result);
	}
}

function freshStore() {
	setActivePinia(createPinia());
	const store = useChatStore();
	const runner = new FakeRunner();
	const notice = vi.fn();
	store.bindTurnRunner(runner, notice);
	return { store, runner, notice };
}

describe('chatStore (SPEC-CC-016)', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('starts empty with the welcome state', () => {
		const { store } = freshStore();
		expect(store.messages).toEqual([]);
		expect(store.status).toBe('empty');
		expect(store.isEmpty).toBe(true);
		expect(store.isStreaming).toBe(false);
	});

	it('canSend is false when streaming or when text is empty/whitespace (REQ-CC-007)', () => {
		const { store } = freshStore();
		expect(store.canSend('')).toBe(false);
		expect(store.canSend('   ')).toBe(false);
		expect(store.canSend('hi')).toBe(true);
	});

	it('EC-1: sendMessage with empty/whitespace text is a no-op (no user message, no run)', async () => {
		const { store, runner } = freshStore();
		await store.sendMessage('   ');
		expect(store.messages).toEqual([]);
		expect(runner.runCalls).toBe(0);
		expect(store.status).toBe('empty');
	});

	it('sendMessage appends a user message, captures history, and starts streaming (REQ-CC-003)', async () => {
		const { store, runner } = freshStore();
		await store.sendMessage('Hello');
		expect(store.messages).toHaveLength(1);
		const user = store.messages[0];
		expect(user.role).toBe('user');
		expect(user.content).toBe('Hello');
		expect(typeof user.id).toBe('string');
		expect(user.id.length).toBeGreaterThan(0);
		expect(runner.runCalls).toBe(1);
		expect(runner.lastInput?.request.text).toBe('Hello');
		// History captured BEFORE the assistant reply includes the just-appended user msg.
		expect(runner.lastInput?.history).toHaveLength(1);
		expect(runner.lastInput?.history[0].content).toBe('Hello');
		expect(store.status).toBe('streaming');
		expect(store.isStreaming).toBe(true);
	});

	it('passes currentNotePath through to the runner', async () => {
		const { store, runner } = freshStore();
		await store.sendMessage('Hello', 'Notes/today.md');
		expect(runner.lastInput?.request.currentNotePath).toBe('Notes/today.md');
	});

	it('onAssistantStart pushes an empty assistant message and sets liveAssistantId', async () => {
		const { store, runner } = freshStore();
		await store.sendMessage('Hi');
		runner.sink?.onAssistantStart();
		expect(store.messages).toHaveLength(2);
		const live = store.messages[1];
		expect(live.role).toBe('assistant');
		expect(live.content).toBe('');
		expect(store.liveAssistantId).toBe(live.id);
	});

	it('onText accumulates into the live assistant message (REQ-CC-004)', async () => {
		const { store, runner } = freshStore();
		await store.sendMessage('Hi');
		runner.sink?.onAssistantStart();
		runner.sink?.onText('Hel');
		runner.sink?.onText('lo');
		runner.sink?.onText(' world');
		expect(store.messages[1].content).toBe('Hello world');
	});

	it('EC-9: onText is ignored after cancel (status !== streaming)', async () => {
		const { store, runner } = freshStore();
		await store.sendMessage('Hi');
		runner.sink?.onAssistantStart();
		runner.sink?.onText('Hel');
		store.cancelTurn();
		runner.sink?.onText('lo'); // should be ignored
		expect(store.messages[1].content).toBe('Hel');
	});

	it('EC-10: onUsage stores the usage DTO without mutating content (REQ-CC-005a)', async () => {
		const { store, runner } = freshStore();
		await store.sendMessage('Hi');
		runner.sink?.onAssistantStart();
		runner.sink?.onText('Reply');
		runner.sink?.onUsage(USAGE);
		expect(store.usage).toEqual(USAGE);
		expect(store.messages[1].content).toBe('Reply');
	});

	it('onErrorChunk appends inline and flags errorActive (EC-6, REQ-CC-012)', async () => {
		const { store, runner } = freshStore();
		await store.sendMessage('Hi');
		runner.sink?.onAssistantStart();
		runner.sink?.onText('partial');
		runner.sink?.onErrorChunk(' boom');
		expect(store.messages[1].content).toBe('partial boom');
		expect(store.errorActive).toBe(true);
	});

	it('onDone finalises to idle when no error (REQ-CC-005)', async () => {
		const { store, runner } = freshStore();
		await store.sendMessage('Hi');
		runner.sink?.onAssistantStart();
		runner.sink?.onText('Reply');
		runner.sink?.onDone();
		expect(store.status).toBe('idle');
		expect(store.liveAssistantId).toBeNull();
		expect(store.isEmpty).toBe(false);
	});

	it('onDone resolves to error status when an error chunk landed (REQ-CC-012)', async () => {
		const { store, runner } = freshStore();
		await store.sendMessage('Hi');
		runner.sink?.onAssistantStart();
		runner.sink?.onErrorChunk('failed');
		runner.sink?.onDone();
		expect(store.status).toBe('error');
		expect(store.liveAssistantId).toBeNull();
	});

	it('EC-5: onDone with zero text finalises the empty assistant message to idle', async () => {
		const { store, runner } = freshStore();
		await store.sendMessage('Hi');
		runner.sink?.onAssistantStart();
		runner.sink?.onDone();
		expect(store.messages).toHaveLength(2);
		expect(store.messages[1].content).toBe('');
		expect(store.status).toBe('idle');
	});

	it('EC-8: cancelTurn marks the live message interrupted and returns to idle (REQ-CC-010)', async () => {
		const { store, runner } = freshStore();
		await store.sendMessage('Hi');
		runner.sink?.onAssistantStart();
		const liveId = store.liveAssistantId;
		store.cancelTurn();
		expect(runner.cancel).toHaveBeenCalledTimes(1);
		expect(store.interruptedId).toBe(liveId);
		expect(store.liveAssistantId).toBeNull();
		expect(store.status).toBe('idle');
	});

	it('EC-7: a not-ready start failure shows a sticky notice and leaves no dangling live message', async () => {
		const { store, runner, notice } = freshStore();
		runner.result = err(new ChatTurnError('not-ready', 'CLI not ready'));
		await store.sendMessage('Hi');
		// The user message stays; the live assistant message must NOT dangle.
		expect(store.liveAssistantId).toBeNull();
		expect(notice).toHaveBeenCalledTimes(1);
		expect(notice).toHaveBeenCalledWith('CLI not ready');
		// Composer must be re-enabled: status resolves to idle (or error→idle), never stuck streaming.
		expect(store.isStreaming).toBe(false);
		expect(store.errorActive).toBe(true);
	});

	it('EC-15: $reset cancels any in-flight turn and clears state', async () => {
		const { store, runner } = freshStore();
		await store.sendMessage('Hi');
		runner.sink?.onAssistantStart();
		store.$reset();
		expect(runner.cancel).toHaveBeenCalled();
		expect(store.messages).toEqual([]);
		expect(store.status).toBe('empty');
		expect(store.liveAssistantId).toBeNull();
		expect(store.interruptedId).toBeNull();
		expect(store.usage).toBeNull();
		expect(store.errorActive).toBe(false);
	});

	it('does not start a second turn while streaming (EC-4, REQ-CC-009)', async () => {
		const { store, runner } = freshStore();
		await store.sendMessage('first');
		await store.sendMessage('second'); // blocked: still streaming
		expect(runner.runCalls).toBe(1);
		expect(store.messages).toHaveLength(1);
	});
});
