/**
 * T-TS-026 (RED) — `tabsStore` (Pinia): N TabState DTOs + activeTabId + per-TabId
 * runner Map (OUTSIDE reactive state) + per-tab streaming isolation + min-1/clamp.
 *
 * SPEC-TS-019, SPEC-TS-030, SPEC-TS-031 + EC-TS-1/2/3/10/11/13. Plain DTOs only —
 * no use-case/runtime instance crosses the store boundary (ADR-003, NFR-TS-003).
 * The store is bound (like the P1 chatStore) with a `TabRuntimeFactory` that builds
 * one `ChatRuntimePort` per tab, a runner factory, a start-failure notifier, an
 * (optional) logger, plus the history port + the maxTabs/title deps — all OUTSIDE
 * reactive state. The store never imports `obsidian`.
 *
 * Names TEST-TS-006/007 (U leg)/008 (U store leg)/016 (truncate)/022/025 (ladder U leg).
 * Traces: REQ-TS-001..007, REQ-TS-008/011/021/024/025.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useTabsStore } from '@/ui/stores/tabsStore';
import type { ChatTurnSink, RunChatTurnInput, ChatTurnError } from '@/application/chat/RunChatTurnUseCase';
import type { ChatTurnRunner } from '@/ui/stores/chatStore';
import { ok, type Result } from '@/domain/shared/Result';
import type { ChatMessage, ConversationMeta, ConversationRecord, UsageInfo } from '@/domain/ports';
import { MockChatRuntime } from '@/infrastructure/mock/MockChatRuntime';
import { MockHistoryStore } from '@/infrastructure/mock/MockHistoryStore';
import type { RuntimeCapabilities } from '@/domain/ports';

/**
 * A runtime that supports fork but NOT rewind — mirrors the production
 * `ClaudeCliChatRuntime` capability after ADR-TS-004 (rewind-to-turn is an
 * Agent-SDK-transport capability, gated OFF on the one-shot `--print` subprocess).
 * The capability is plain data, so the store's rewind gate is testable without a
 * subprocess (ClaudeCliChatRuntime itself is coverage-excluded infra).
 */
class NoRewindRuntime extends MockChatRuntime {
	override getCapabilities(): RuntimeCapabilities {
		return { supportsFork: true, supportsRewind: false };
	}
}

const USAGE: UsageInfo = {
	inputTokens: 10,
	contextWindow: 200000,
	contextTokens: 50,
	percentage: 0.025,
};

/**
 * A scriptable runner standing in for `RunChatTurnUseCase`: captures the sink so the
 * test can drive the sink legs directly per tab. One runner is built per tab.
 */
class FakeRunner implements ChatTurnRunner {
	sink: ChatTurnSink | null = null;
	lastInput: RunChatTurnInput | null = null;
	result: Result<void, ChatTurnError> = ok(undefined);
	duringRun: ((sink: ChatTurnSink) => void) | null = null;
	runCalls = 0;
	cancel = vi.fn();

	run(input: RunChatTurnInput, sink: ChatTurnSink): Promise<Result<void, ChatTurnError>> {
		this.runCalls += 1;
		this.lastInput = input;
		this.sink = sink;
		this.duringRun?.(sink);
		return Promise.resolve(this.result);
	}
}

interface Harness {
	store: ReturnType<typeof useTabsStore>;
	runners: FakeRunner[];
	runtimes: MockChatRuntime[];
	history: MockHistoryStore;
	notices: string[];
	maxTabs: number;
	titleResult: Result<string>;
}

/**
 * Build a fresh bound store. `bindTabDeps` wires the OUTSIDE-reactive-state deps:
 * a runtime factory (one MockChatRuntime per tab), a runner factory (one FakeRunner
 * per tab), the start-failure notifier, the history port + a title generator.
 */
function freshStore(opts?: {
	maxTabs?: number;
	titleResult?: Result<string>;
	createRuntime?: () => MockChatRuntime;
}): Harness {
	setActivePinia(createPinia());
	const store = useTabsStore();
	const runners: FakeRunner[] = [];
	const runtimes: MockChatRuntime[] = [];
	const notices: string[] = [];
	const history = new MockHistoryStore();
	const harness: Harness = {
		store,
		runners,
		runtimes,
		history,
		notices,
		maxTabs: opts?.maxTabs ?? 3,
		titleResult: opts?.titleResult ?? ok('AI generated title'),
	};
	store.bindTabDeps({
		createRuntime: () => {
			const runtime = opts?.createRuntime?.() ?? new MockChatRuntime([]);
			runtimes.push(runtime);
			return runtime;
		},
		createRunner: () => {
			const runner = new FakeRunner();
			runners.push(runner);
			return runner;
		},
		notifyStartFailure: (message: string) => notices.push(message),
		notifyInfo: (message: string) => notices.push(message),
		history,
		generateTitle: () => Promise.resolve(harness.titleResult),
		getMaxTabs: () => harness.maxTabs,
	});
	return harness;
}

describe('tabsStore (SPEC-TS-019)', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('starts with exactly one empty active tab (min-1, EC-TS-2)', () => {
		const { store } = freshStore();
		expect(store.tabs).toHaveLength(1);
		expect(store.tabs[0].status).toBe('empty');
		expect(store.activeTabId).toBe(store.tabs[0].id);
		expect(store.activeTab?.id).toBe(store.tabs[0].id);
	});

	// ── open / switch / close (TEST-TS-006/008) ────────────────────────────────

	it('TEST-TS-006: openTab appends a fresh empty tab and activates it; existing tabs unchanged', () => {
		const { store } = freshStore();
		const first = store.tabs[0].id;
		store.openTab();
		expect(store.tabs).toHaveLength(2);
		expect(store.tabs[1].status).toBe('empty');
		expect(store.activeTabId).toBe(store.tabs[1].id);
		// First tab is untouched.
		expect(store.tabs[0].id).toBe(first);
		expect(store.tabs[0].status).toBe('empty');
	});

	it('EC-TS-1: openTab beyond clampMaxTabs is a no-op + a showInfo notice', () => {
		const { store, notices } = freshStore({ maxTabs: 2 });
		store.openTab(); // 2 tabs
		expect(store.tabs).toHaveLength(2);
		store.openTab(); // would be 3 — clamped
		expect(store.tabs).toHaveLength(2);
		expect(notices.length).toBeGreaterThan(0);
	});

	it('switchTab activates the target and clears its needsAttention; other tabs untouched (REQ-TS-002)', () => {
		const { store } = freshStore();
		store.openTab();
		const a = store.tabs[0];
		const b = store.tabs[1];
		store.markAttention(a.id);
		expect(a.needsAttention).toBe(true);
		store.switchTab(a.id);
		expect(store.activeTabId).toBe(a.id);
		expect(a.needsAttention).toBe(false);
		// b untouched.
		expect(b.needsAttention).toBe(false);
	});

	it('TEST-TS-008: closeTab removes the tab + disposes its runner + activates the previous neighbour', () => {
		const { store, runners } = freshStore();
		store.openTab(); // tab 2 (index 1)
		store.openTab(); // tab 3 (index 2), active
		const third = store.tabs[2].id;
		const thirdRunner = runners[runners.length - 1];
		store.closeTab(third);
		expect(store.tabs).toHaveLength(2);
		expect(thirdRunner.cancel).toHaveBeenCalled();
		// Previous neighbour (index 1) becomes active.
		expect(store.activeTabId).toBe(store.tabs[1].id);
	});

	it('TEST-TS-008: closing the first tab activates the next neighbour', () => {
		const { store } = freshStore();
		store.openTab();
		const first = store.tabs[0].id;
		const second = store.tabs[1].id;
		store.switchTab(first);
		store.closeTab(first);
		expect(store.tabs).toHaveLength(1);
		expect(store.activeTabId).toBe(second);
	});

	it('EC-TS-2: closing the last tab leaves exactly one fresh empty tab', () => {
		const { store } = freshStore();
		const only = store.tabs[0].id;
		store.closeTab(only);
		expect(store.tabs).toHaveLength(1);
		expect(store.tabs[0].status).toBe('empty');
		expect(store.tabs[0].id).not.toBe(only); // a fresh tab
		expect(store.activeTabId).toBe(store.tabs[0].id);
	});

	// ── per-tab streaming isolation (TEST-TS-007 / EC-TS-3/13) ──────────────────

	it('TEST-TS-007: a sink chunk for tab B mutates only B while A is active+idle', async () => {
		const { store, runners } = freshStore();
		const a = store.tabs[0].id;
		store.openTab(); // tab B active
		const b = store.tabs[1].id;
		const bRunner = runners[runners.length - 1];

		await store.sendMessage('to B');
		// Switch back to A while B streams.
		store.switchTab(a);
		expect(store.activeTabId).toBe(a);

		bRunner.sink?.onAssistantStart();
		bRunner.sink?.onText('partial B');
		// A (active) is untouched; B carries the streamed text.
		const tabA = store.tabs.find((t) => t.id === a);
		const tabB = store.tabs.find((t) => t.id === b);
		expect(tabA?.messages).toHaveLength(0);
		expect(tabB?.messages.some((m) => m.content.includes('partial B'))).toBe(true);
	});

	it('EC-TS-13: two tabs stream concurrently with isolated usage', async () => {
		const { store, runners } = freshStore();
		const a = store.tabs[0].id;
		store.switchTab(a);
		await store.sendMessage('to A');
		const aRunner = runners[runners.length - 1];
		store.openTab();
		const b = store.tabs[1].id;
		await store.sendMessage('to B');
		const bRunner = runners[runners.length - 1];

		aRunner.sink?.onAssistantStart();
		aRunner.sink?.onUsage(USAGE);
		bRunner.sink?.onAssistantStart();

		const tabA = store.tabs.find((t) => t.id === a);
		const tabB = store.tabs.find((t) => t.id === b);
		expect(tabA?.usage).toEqual(USAGE);
		expect(tabB?.usage).toBeNull();
	});

	it('REQ-TS-007: a non-active tab whose turn ends gets needsAttention (markAttention)', async () => {
		const { store, runners } = freshStore();
		const a = store.tabs[0].id;
		store.openTab(); // B active
		const b = store.tabs[1].id;
		await store.sendMessage('to B');
		const bRunner = runners[runners.length - 1];
		// Switch to A; B finishes in the background.
		store.switchTab(a);
		bRunner.sink?.onAssistantStart();
		bRunner.sink?.onDone();
		const tabB = store.tabs.find((t) => t.id === b);
		expect(tabB?.needsAttention).toBe(true);
		// The active tab never sets attention.
		const tabA = store.tabs.find((t) => t.id === a);
		expect(tabA?.needsAttention).toBe(false);
	});

	// ── loadIntoTab + truncateTo (TEST-TS-016) ──────────────────────────────────

	it('loadIntoTab(current) sets messages/title/conversationId/sessionId + binds resume', () => {
		const { store, runtimes } = freshStore();
		const target = store.activeTabId!;
		const messages: ChatMessage[] = [{ id: 'm1', role: 'user', content: 'hi', timestamp: 1 }];
		store.loadIntoTab(target, {
			conversationId: 'conv-1',
			title: 'Resumed',
			messages,
			sessionId: 'sess-9',
		});
		const tab = store.activeTab;
		expect(tab?.messages).toHaveLength(1);
		expect(tab?.title).toBe('Resumed');
		expect(tab?.conversationId).toBe('conv-1');
		expect(tab?.sessionId).toBe('sess-9');
		// resumeSession bound on the tab's runtime.
		expect(runtimes[0].getResumedSessionId()).toBe('sess-9');
	});

	it('loadIntoTab(new) opens a fresh tab carrying the payload', () => {
		const { store } = freshStore();
		const messages: ChatMessage[] = [{ id: 'm1', role: 'user', content: 'hi', timestamp: 1 }];
		store.loadIntoNewTab({
			conversationId: null,
			title: 'Forked',
			messages,
			sessionId: null,
		});
		expect(store.tabs).toHaveLength(2);
		expect(store.activeTab?.title).toBe('Forked');
		expect(store.activeTab?.messages).toHaveLength(1);
	});

	it('TEST-TS-016: truncateTo removes messages after the user message (rewind)', () => {
		const { store } = freshStore();
		const target = store.activeTabId!;
		const messages: ChatMessage[] = [
			{ id: 'u1', role: 'user', content: 'first', timestamp: 1 },
			{ id: 'a1', role: 'assistant', content: 'reply', timestamp: 2, assistantMessageId: 'turn-1' },
			{ id: 'u2', role: 'user', content: 'second', timestamp: 3 },
			{ id: 'a2', role: 'assistant', content: 'reply2', timestamp: 4 },
		];
		store.loadIntoTab(target, { conversationId: 'c', title: 't', messages, sessionId: null });
		store.truncateTo(target, 'u1');
		const tab = store.activeTab;
		expect(tab?.messages.map((m) => m.id)).toEqual(['u1']);
	});

	// ── persist + title ladder (TEST-TS-022/025, SPEC-TS-030/031) ────────────────

	it('SPEC-TS-030: a completed first turn persists a ConversationRecord to history', async () => {
		const { store, runners, history } = freshStore();
		const target = store.activeTabId!;
		store.switchTab(target);
		await store.sendMessage('Hello there');
		const runner = runners[runners.length - 1];
		runner.sink?.onAssistantStart();
		runner.sink?.onText('Hi back');
		runner.sink?.onDone();
		await flushAll();
		const listed = await history.listSessions();
		expect(listed.ok).toBe(true);
		if (listed.ok) expect(listed.value.length).toBeGreaterThan(0);
	});

	it('TEST-TS-025: title ladder — fallback set immediately on first-turn done, then AI title replaces it', async () => {
		const { store, runners } = freshStore({ titleResult: ok('Strong verb summary') });
		const target = store.activeTabId!;
		store.switchTab(target);
		await store.sendMessage('Help me write a parser');
		const runner = runners[runners.length - 1];
		runner.sink?.onAssistantStart();
		runner.sink?.onText('Sure');
		runner.sink?.onDone();
		// Immediately after done, a non-empty fallback title exists.
		const fallback = store.activeTab?.title ?? '';
		expect(fallback.length).toBeGreaterThan(0);
		await flushAll();
		// The AI title replaces it (titleManual === false).
		expect(store.activeTab?.title).toBe('Strong verb summary');
		expect(store.activeTab?.titleStatus).toBe('success');
	});

	it('EC-TS-11: title-gen failure keeps the fallback (status failed, no throw)', async () => {
		const { store, runners } = freshStore({
			titleResult: { ok: false, error: new Error('no title') },
		});
		const target = store.activeTabId!;
		store.switchTab(target);
		await store.sendMessage('A question');
		const runner = runners[runners.length - 1];
		runner.sink?.onAssistantStart();
		runner.sink?.onText('answer');
		runner.sink?.onDone();
		const fallback = store.activeTab?.title ?? '';
		await flushAll();
		expect(store.activeTab?.title).toBe(fallback);
		expect(store.activeTab?.titleStatus).toBe('failed');
	});

	// ── DTO-only + $reset (TEST-TS-022) ─────────────────────────────────────────

	it('TEST-TS-022: holds plain DTOs — no runner/runtime instance on reactive state', () => {
		const { store } = freshStore();
		store.openTab();
		const serialised = JSON.parse(JSON.stringify(store.tabs));
		// A round-trip through JSON proves no class instance / function lives in state.
		expect(Array.isArray(serialised)).toBe(true);
		for (const tab of store.tabs) {
			for (const value of Object.values(tab)) {
				expect(typeof value).not.toBe('function');
			}
		}
	});

	it('TEST-TS-022: $reset cancels every open tab and leaves exactly one fresh empty tab', () => {
		const { store, runners } = freshStore();
		store.openTab();
		store.openTab();
		const beforeReset = [...runners]; // the runners bound before $reset (a fresh one is spawned after)
		store.$reset();
		for (const runner of beforeReset) {
			expect(runner.cancel).toHaveBeenCalled();
		}
		expect(store.tabs).toHaveLength(1);
		expect(store.tabs[0].status).toBe('empty');
	});

	// ── R-TS-001: live-path rewind ids (REQ-TS-019) ─────────────────────────────

	it('R-TS-001: sendMessage stamps userMessageId on the user message at send', async () => {
		const { store } = freshStore();
		const target = store.activeTabId!;
		store.switchTab(target);
		await store.sendMessage('Drive a real turn');
		const userMsg = store.activeTab?.messages.find((m) => m.role === 'user');
		expect(userMsg?.userMessageId).toBeTruthy();
		// The user turn id keys eligibility; it is the user message's own id.
		expect(userMsg?.userMessageId).toBe(userMsg?.id);
	});

	it('R-TS-001: a completed turn stamps assistantMessageId so rewind is eligible', async () => {
		const { store, runners } = freshStore();
		const target = store.activeTabId!;
		store.switchTab(target);
		await store.sendMessage('Make me rewindable');
		const runner = runners[runners.length - 1];
		runner.sink?.onAssistantStart();
		runner.sink?.onText('a reply');
		// The runtime surfaces the per-turn id on done (R-TS-001).
		runner.sink?.onDone('turn-id-from-runtime');
		const assistant = store.activeTab?.messages.find((m) => m.role === 'assistant');
		expect(assistant?.assistantMessageId).toBe('turn-id-from-runtime');
		const userMsg = store.activeTab?.messages.find((m) => m.role === 'user');
		// The whole point: rewind eligibility now renders for a real conversation.
		expect(store.canRewindMessage(userMsg!.id)).toBe(true);
	});

	it('R-TS-001: onDone with no runtime id still stamps a stable assistantMessageId', async () => {
		const { store, runners } = freshStore();
		const target = store.activeTabId!;
		store.switchTab(target);
		await store.sendMessage('No runtime id');
		const runner = runners[runners.length - 1];
		runner.sink?.onAssistantStart();
		runner.sink?.onText('reply');
		runner.sink?.onDone();
		const assistant = store.activeTab?.messages.find((m) => m.role === 'assistant');
		expect(assistant?.assistantMessageId).toBeTruthy();
		const userMsg = store.activeTab?.messages.find((m) => m.role === 'user');
		expect(store.canRewindMessage(userMsg!.id)).toBe(true);
	});

	// ── R-TS-002 / ADR-TS-004: rewind gated by runtime capability, not provider ──

	it('ADR-TS-004: canRewindMessage is FALSE on a supportsRewind:false runtime even when eligibility holds', async () => {
		const { store, runners } = freshStore({ createRuntime: () => new NoRewindRuntime([]) });
		const target = store.activeTabId!;
		store.switchTab(target);
		await store.sendMessage('Make me eligible');
		const runner = runners[runners.length - 1];
		runner.sink?.onAssistantStart();
		runner.sink?.onText('a reply');
		runner.sink?.onDone('turn-id-from-runtime');
		const userMsg = store.activeTab?.messages.find((m) => m.role === 'user');
		// Eligibility still computes (assistantMessageId is stamped — R-TS-001 kept),
		// but the capability gate keeps the affordance off on this transport.
		expect(store.activeCapabilities().supportsRewind).toBe(false);
		expect(store.canRewindMessage(userMsg!.id)).toBe(false);
	});

	it('ADR-TS-004: canRewindMessage is TRUE on a supportsRewind:true runtime with the same eligibility', async () => {
		const { store, runners } = freshStore();
		const target = store.activeTabId!;
		store.switchTab(target);
		await store.sendMessage('Make me eligible');
		const runner = runners[runners.length - 1];
		runner.sink?.onAssistantStart();
		runner.sink?.onText('a reply');
		runner.sink?.onDone('turn-id-from-runtime');
		const userMsg = store.activeTab?.messages.find((m) => m.role === 'user');
		expect(store.activeCapabilities().supportsRewind).toBe(true);
		expect(store.canRewindMessage(userMsg!.id)).toBe(true);
	});

	// ── R-TS-006: compact boundary renders even with no live assistant message ──

	it('R-TS-006: compactActive renders the context_compacted boundary with no live message', async () => {
		const { store, runners } = freshStore();
		const target = store.activeTabId!;
		store.switchTab(target);
		// Seed a prior turn so the tab is non-empty (a real compact follows a turn).
		await store.sendMessage('earlier turn');
		const firstRunner = runners[runners.length - 1];
		firstRunner.sink?.onAssistantStart();
		firstRunner.sink?.onText('ok');
		firstRunner.sink?.onDone('t1');

		// The compact turn's runner emits `context_compacted` WITHOUT onAssistantStart.
		const compactRunner = runners[runners.length - 1];
		compactRunner.duringRun = (sink) => {
			sink.onContextCompacted();
			sink.onDone();
		};
		await store.compactActive();
		const blocks = (store.activeTab?.messages ?? []).flatMap((m) => m.contentBlocks ?? []);
		expect(blocks.some((b) => b.type === 'context_compacted')).toBe(true);
	});

	it('R-TS-006: compact still resolves the tab to a non-streaming status after the boundary', async () => {
		const { store, runners } = freshStore();
		const target = store.activeTabId!;
		store.switchTab(target);
		await store.sendMessage('earlier');
		const firstRunner = runners[runners.length - 1];
		firstRunner.sink?.onAssistantStart();
		firstRunner.sink?.onDone('t1');

		const compactRunner = runners[runners.length - 1];
		compactRunner.duringRun = (sink) => {
			sink.onContextCompacted();
			sink.onDone();
		};
		await store.compactActive();
		expect(store.activeTab?.status).not.toBe('streaming');
	});

	// ── R-TS-005: resume must not clobber an in-flight streaming tab ────────────

	it('R-TS-005: resuming into a streaming tab cancels the in-flight runner first', async () => {
		const { store, runners } = freshStore();
		const target = store.activeTabId!;
		store.switchTab(target);
		await store.sendMessage('streaming turn');
		const runner = runners[runners.length - 1];
		runner.sink?.onAssistantStart();
		runner.sink?.onText('partial');
		expect(store.activeTab?.status).toBe('streaming');

		// Resume a different conversation into the same (streaming) tab.
		store.loadIntoTab(target, {
			conversationId: 'resumed',
			title: 'Resumed',
			messages: [{ id: 'r1', role: 'user', content: 'resumed hi', timestamp: 9 }],
			sessionId: 'sess-r',
		});
		// The in-flight runner is cancelled before the overwrite (no zombie sink).
		expect(runner.cancel).toHaveBeenCalled();
		// The tab now holds the resumed transcript, not the streamed partial.
		expect(store.activeTab?.conversationId).toBe('resumed');
		expect(store.activeTab?.messages.map((m) => m.id)).toEqual(['r1']);
		expect(store.activeTab?.status).toBe('idle');
		expect(store.activeTab?.liveAssistantId).toBeNull();
	});

	it('R-TS-005: a late sink chunk from the cancelled runner cannot corrupt the resumed transcript', async () => {
		const { store, runners } = freshStore();
		const target = store.activeTabId!;
		store.switchTab(target);
		await store.sendMessage('streaming turn');
		const runner = runners[runners.length - 1];
		runner.sink?.onAssistantStart();

		store.loadIntoTab(target, {
			conversationId: 'resumed',
			title: 'Resumed',
			messages: [{ id: 'r1', role: 'user', content: 'resumed hi', timestamp: 9 }],
			sessionId: null,
		});
		// A stray late chunk on the old runner's sink: the resumed tab is no longer
		// streaming, so the sink leg no-ops (the live id was cleared on load).
		runner.sink?.onText('zombie text');
		runner.sink?.onDone('zombie-turn');
		const messages = store.activeTab?.messages ?? [];
		expect(messages.map((m) => m.id)).toEqual(['r1']);
		expect(messages.some((m) => m.content.includes('zombie'))).toBe(false);
	});

	// ── R-TS-003: fork lineage threads through to the persisted record ──────────

	it('R-TS-003: forkActive carries the derived providerState into the new tab record', async () => {
		const { store, runners, history } = freshStore();
		// Seed a source conversation with a session id so buildForkPlan derives lineage.
		const source: ConversationRecord = {
			version: 1,
			meta: {
				id: 'src',
				title: 'Source chat',
				titleManual: false,
				createdAt: 10,
				updatedAt: 20,
				providerId: 'claude',
				sessionId: 'sess-src',
			},
			messages: [
				{ id: 'u1', role: 'user', content: 'hi', userMessageId: 'u1', timestamp: 1 },
				{ id: 'a1', role: 'assistant', content: 'yo', assistantMessageId: 'turn-1', timestamp: 2 },
			],
			providerState: {},
		};
		history.seedConversations([source]);
		// Bind the active tab to the source conversation so forkActive can derive.
		const active = store.activeTabId!;
		store.loadIntoTab(active, {
			conversationId: 'src',
			title: 'Source chat',
			messages: source.messages.map((m) => ({ ...m })),
			sessionId: 'sess-src',
		});

		await store.forkActive('new-tab', 'u1');
		// The forked tab is now active; persist it (first turn) and inspect the record.
		const forkedTabId = store.activeTabId!;
		await store._persistTab(forkedTabId);
		void runners;
		const forkedConvId = store.activeTab?.conversationId;
		expect(forkedConvId).toBeTruthy();
		const hydrated = await history.hydrate(forkedConvId!);
		expect(hydrated.ok).toBe(true);
		if (hydrated.ok) {
			const state = hydrated.value.providerState as {
				forkSource?: { sessionId: string; resumeAt: string };
			};
			expect(state.forkSource).toEqual({ sessionId: 'sess-src', resumeAt: 'u1' });
		}
	});

	it('R-TS-003: loadIntoTab stores the payload providerState on the tab', () => {
		const { store } = freshStore();
		const target = store.activeTabId!;
		store.loadIntoTab(target, {
			conversationId: 'c',
			title: 't',
			messages: [{ id: 'm1', role: 'user', content: 'hi', timestamp: 1 }],
			sessionId: null,
			providerState: { forkSource: { sessionId: 'sess-x', resumeAt: 'm1' } },
		});
		expect(store.activeTab?.providerState).toEqual({
			forkSource: { sessionId: 'sess-x', resumeAt: 'm1' },
		});
	});

	// ── R-TS-004: persist preserves createdAt + providerState across saves ──────

	it('R-TS-004: re-persisting preserves createdAt and only bumps updatedAt', async () => {
		const { store, history } = freshStore();
		const target = store.activeTabId!;
		store.switchTab(target);
		await store.sendMessage('first turn');
		// First persist.
		await store._persistTab(target);
		const convId = store.activeTab!.conversationId!;
		const after1 = await metaOf(history, convId);
		const createdAt1 = after1.createdAt;
		// A later save (e.g. a title-ladder re-persist or a follow-up turn).
		await new Promise((r) => setTimeout(r, 5));
		await store._persistTab(target);
		const after2 = await metaOf(history, convId);
		expect(after2.createdAt).toBe(createdAt1);
		expect(after2.updatedAt).toBeGreaterThanOrEqual(after2.createdAt);
	});

	it('R-TS-004: re-persisting retains the tab providerState (does not wipe to {})', async () => {
		const { store, history } = freshStore();
		const target = store.activeTabId!;
		store.loadIntoTab(target, {
			conversationId: null,
			title: 'Forked',
			messages: [{ id: 'm1', role: 'user', content: 'hi', timestamp: 1 }],
			sessionId: null,
			providerState: { forkSource: { sessionId: 'sess-y', resumeAt: 'm1' } },
		});
		await store._persistTab(target);
		const convId = store.activeTab?.conversationId;
		// Save again — lineage must survive.
		await store._persistTab(target);
		const hydrated = await history.hydrate(convId!);
		expect(hydrated.ok).toBe(true);
		if (hydrated.ok) {
			expect(hydrated.value.providerState).toEqual({
				forkSource: { sessionId: 'sess-y', resumeAt: 'm1' },
			});
		}
	});

	// ── getters ─────────────────────────────────────────────────────────────────

	it('isEmpty / isStreaming read the active tab', async () => {
		const { store, runners } = freshStore();
		expect(store.isEmpty).toBe(true);
		expect(store.isStreaming).toBe(false);
		await store.sendMessage('Hi');
		expect(store.isEmpty).toBe(false);
		expect(store.isStreaming).toBe(true);
		const runner = runners[runners.length - 1];
		runner.sink?.onAssistantStart();
		runner.sink?.onDone();
		expect(store.isStreaming).toBe(false);
	});
});

/** Read the persisted meta for a conversation id (R-TS-004 createdAt/updatedAt). */
async function metaOf(history: MockHistoryStore, id: string): Promise<ConversationMeta> {
	const hydrated = await history.hydrate(id);
	if (!hydrated.ok) throw new Error(`no record for ${id}`);
	return hydrated.value.meta;
}

/** Flush the chained microtasks (persist + title ladder) the store schedules. */
async function flushAll(): Promise<void> {
	for (let i = 0; i < 8; i++) {
		await Promise.resolve();
	}
}
