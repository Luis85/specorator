/**
 * T-AS-028 (RED) — `tabsStore` P7 `permissionMode` control + fold-on-submit + tab-switch
 * re-derive (TEST-AS-002 store-fold leg, TEST-AS-006).
 *
 * SPEC-AS-017. `setControl('permissionMode', mode)` reuses the P6 generic `setControl`,
 * mutating only the active tab's `controls.permissionMode` (a draft input — it does not
 * send, REQ-AS-002); `freshTab()` seeds `controls:{}` (unset ⇒ `normal`, REQ-AS-006);
 * `loadIntoTab` resets `controls` to `{}` (open item #5); on submit `_turnQueryOptions()`
 * folds `permissionMode` non-`normal`-only (TEST-AS-002, SPEC-AS-011); switching tabs
 * re-derives the active mode (TEST-AS-006, EC-AS-18).
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

function freshStore() {
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
	});
	return { store, runners };
}

describe('tabsStore P7 permissionMode control (SPEC-AS-017)', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('setControl(permissionMode) sets the active tab control as a draft input (no send)', () => {
		const { store, runners } = freshStore();
		store.setControl('permissionMode', 'yolo');
		expect(store.activeTab?.controls.permissionMode).toBe('yolo');
		expect(runners[0]?.lastInput).toBeNull();
	});

	it('TEST-AS-002/EC-AS-2: normal/absent folds nothing into the query (byte-identical P6)', async () => {
		const { store, runners } = freshStore();
		await store.sendMessage('hello');
		expect(runners[0]?.lastInput?.queryOptions?.permissionMode).toBeUndefined();

		store.setControl('permissionMode', 'normal');
		await store.sendMessage('again');
		expect(runners[0]?.lastInput?.queryOptions?.permissionMode).toBeUndefined();
	});

	it('TEST-AS-002: a non-normal mode folds into the next turn', async () => {
		const { store, runners } = freshStore();
		store.setControl('permissionMode', 'plan');
		await store.sendMessage('drive a turn');
		expect(runners[0]?.lastInput?.queryOptions?.permissionMode).toBe('plan');
	});

	it('TEST-AS-006/EC-AS-18: switching tabs re-derives the active mode', () => {
		const { store } = freshStore();
		store.setControl('permissionMode', 'yolo');
		const firstTab = store.activeTabId;
		store.openTab();
		// The new tab starts at the default (unset ⇒ normal).
		expect(store.activeTab?.controls.permissionMode).toBeUndefined();
		if (firstTab === null) throw new Error('no first tab');
		store.switchTab(firstTab);
		expect(store.activeTab?.controls.permissionMode).toBe('yolo');
	});

	it('loadIntoTab resets the permissionMode draft to default', () => {
		const { store } = freshStore();
		store.setControl('permissionMode', 'yolo');
		const tabId = store.activeTabId;
		if (tabId === null) throw new Error('no active tab');
		store.loadIntoTab(tabId, {
			conversationId: 'c1',
			title: 'resumed',
			messages: [],
			sessionId: null,
		});
		expect(store.activeTab?.controls.permissionMode).toBeUndefined();
	});
});
