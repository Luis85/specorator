/**
 * T-TC-027 (RED) — `tabsStore` P6 controls / setControl / fold-on-submit
 * (TEST-TC-002/004/006/012/042 store-fold legs).
 *
 * SPEC-TC-023. `TabState` grows `controls: TabControls`; `freshTab()` seeds
 * `controls:{}`; `loadIntoTab` resets `controls` to `{}` (REQ-TC-042);
 * `setControl(field, value)` sets `activeTab.controls[field]` and is a
 * draft-input mutation (does NOT send); on submit `_turnQueryOptions()` merges
 * `foldControlOptions(active.controls)` into the query options it already builds
 * from `appendSystemPrompt` — an untouched-toolbar turn writes no new field
 * (byte-identical to P5, EC-TC-1/6); a backed widget change folds into the next
 * turn, others untouched (TEST-TC-004/012/042).
 *
 * Traces: REQ-TC-004/012/042, SPEC-TC-006/010/023, NFR-TC-001/005.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useTabsStore } from '@/ui/stores/tabsStore';
import { MockChatRuntime } from '@/infrastructure/mock/MockChatRuntime';
import { MockHistoryStore } from '@/infrastructure/mock/MockHistoryStore';
import { ok, type Result } from '@/domain/shared/Result';
import type {
	ChatTurnSink,
	RunChatTurnInput,
	ChatTurnError,
} from '@/application/chat/RunChatTurnUseCase';
import type { ChatTurnRunner } from '@/ui/stores/chatStore';

class FakeRunner implements ChatTurnRunner {
	lastInput: RunChatTurnInput | null = null;
	cancel = vi.fn();
	run(input: RunChatTurnInput, _sink: ChatTurnSink): Promise<Result<void, ChatTurnError>> {
		this.lastInput = input;
		return Promise.resolve(ok(undefined));
	}
}

function freshStore(opts?: { getAppendSystemPrompt?: () => Promise<string | undefined> }) {
	setActivePinia(createPinia());
	const store = useTabsStore();
	const runners: FakeRunner[] = [];
	store.bindTabDeps({
		createRuntime: () => new MockChatRuntime([]),
		createRunner: () => {
			const runner = new FakeRunner();
			runners.push(runner);
			return runner;
		},
		notifyStartFailure: () => undefined,
		notifyInfo: () => undefined,
		history: new MockHistoryStore(),
		generateTitle: () => Promise.resolve(ok('title')),
		getMaxTabs: () => 3,
		getAppendSystemPrompt: opts?.getAppendSystemPrompt,
	});
	return { store, runners };
}

describe('tabsStore P6 controls (SPEC-TC-023)', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('TEST-TC-006: freshTab seeds controls:{}', () => {
		const { store } = freshStore();
		expect(store.activeTab?.controls).toEqual({});
	});

	it('setControl sets the active tab control as a draft input (no send)', () => {
		const { store, runners } = freshStore();
		store.setControl('model', 'claude-opus');
		expect(store.activeTab?.controls.model).toBe('claude-opus');
		// Draft input only — nothing was sent.
		expect(runners[0]?.lastInput).toBeNull();
	});

	it('TEST-TC-002/EC-TC-1: an untouched toolbar turn writes no new query field', async () => {
		const { store, runners } = freshStore();
		await store.sendMessage('hello');
		const opts = runners[0]?.lastInput?.queryOptions;
		expect(opts?.model).toBeUndefined();
		expect(opts?.mode).toBeUndefined();
		expect(opts?.reasoning).toBeUndefined();
		expect(opts?.serviceTier).toBeUndefined();
	});

	it('TEST-TC-004/012: a backed widget change folds into the next turn', async () => {
		const { store, runners } = freshStore();
		store.setControl('model', 'claude-opus');
		store.setControl('mode', 'accept-edits');
		store.setControl('reasoning', { kind: 'effort', value: 'high' });
		await store.sendMessage('drive a turn');
		const opts = runners[0]?.lastInput?.queryOptions;
		expect(opts?.model).toBe('claude-opus');
		expect(opts?.mode).toBe('accept-edits');
		expect(opts?.reasoning).toEqual({ kind: 'effort', value: 'high' });
	});

	it('the fold coexists with the P5 appendSystemPrompt fold', async () => {
		const { store, runners } = freshStore({
			getAppendSystemPrompt: () => Promise.resolve('Answer in French.'),
		});
		store.setControl('model', 'claude-opus');
		await store.sendMessage('coexist');
		const opts = runners[0]?.lastInput?.queryOptions;
		expect(opts?.appendSystemPrompt).toBe('Answer in French.');
		expect(opts?.model).toBe('claude-opus');
	});

	it('TEST-TC-042: loadIntoTab resets controls to {}', () => {
		const { store } = freshStore();
		store.setControl('model', 'claude-opus');
		const tabId = store.activeTabId;
		if (tabId === null) throw new Error('no active tab');
		store.loadIntoTab(tabId, {
			conversationId: 'c1',
			title: 'resumed',
			messages: [],
			sessionId: null,
		});
		expect(store.activeTab?.controls).toEqual({});
	});
});
