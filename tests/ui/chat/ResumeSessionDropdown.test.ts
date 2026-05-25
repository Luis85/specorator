/**
 * T-TS-030 (RED) — `ResumeSessionDropdown.vue` (TEST-TS-011/013/015/025 A legs).
 *
 * SPEC-TS-022. A drop-UP history listbox opened from a control near the composer:
 * title + relative date rows, newest-updatedAt first; empty line; resume → tabsStore
 * loadIntoTab (P2 block path, collapsed by default); inline rename → Rename use case
 * (titleManual:true); delete → DeleteConfirmModal (Obsidian Modal seam, never
 * window.confirm) → Delete use case; pending spin / failed keeps fallback; Arrow
 * Up/Down move selection, Enter resumes, Escape closes + focus returns. data-testid
 * only (ADR-009).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import ResumeSessionDropdown from '@/ui/chat/ResumeSessionDropdown.vue';
import { useTabsStore } from '@/ui/stores/tabsStore';
import type { ChatTurnRunner } from '@/ui/stores/chatStore';
import { i18n } from '@/ui/i18n';
import { ok } from '@/domain/shared/Result';
import { PROVIDER_HISTORY_PORT } from '@/infrastructure/bridge/ports';
import { CONFIRM_DELETE } from '@/ui/chat/modalSeam';
import { MockChatRuntime } from '@/infrastructure/mock/MockChatRuntime';
import { MockHistoryStore } from '@/infrastructure/mock/MockHistoryStore';
import type { ConversationRecord } from '@/domain/ports';
import { ResumeSessionDropdownPageObject } from './ResumeSessionDropdown.po';

function record(id: string, title: string, updatedAt: number): ConversationRecord {
	return {
		version: 1,
		meta: {
			id,
			title,
			titleManual: false,
			createdAt: updatedAt,
			updatedAt,
			providerId: 'claude',
			sessionId: `sess-${id}`,
		},
		messages: [{ id: `${id}-u`, role: 'user', content: `hi ${title}`, timestamp: updatedAt }],
		providerState: {},
	};
}

function fakeRunner(): ChatTurnRunner {
	return { run: vi.fn().mockResolvedValue(ok(undefined)), cancel: vi.fn() };
}

function bindStore() {
	const store = useTabsStore();
	store.bindTabDeps({
		createRuntime: () => new MockChatRuntime([]),
		createRunner: () => fakeRunner(),
		notifyStartFailure: () => undefined,
		notifyInfo: () => undefined,
		history: new MockHistoryStore(),
		generateTitle: () => Promise.resolve(ok('title')),
		getMaxTabs: () => 3,
	});
	return store;
}

function mountDropdown(opts?: {
	history?: MockHistoryStore;
	confirmDelete?: (msg: string) => Promise<boolean>;
}) {
	const history = opts?.history ?? new MockHistoryStore();
	const confirmDelete = opts?.confirmDelete ?? (() => Promise.resolve(true));
	const wrapper = mount(ResumeSessionDropdown, {
		attachTo: document.body,
		global: {
			plugins: [i18n],
			provide: {
				[PROVIDER_HISTORY_PORT as symbol]: history,
				[CONFIRM_DELETE as symbol]: confirmDelete,
			},
		},
	});
	return { wrapper, po: new ResumeSessionDropdownPageObject(wrapper), history };
}

describe('ResumeSessionDropdown (SPEC-TS-022)', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		bindStore();
	});

	it('renders an opener; the list is closed until opened', () => {
		const { po } = mountDropdown();
		expect(po.hasOpener()).toBe(true);
		expect(po.isListOpen()).toBe(false);
	});

	it('TEST-TS-011: opening lists conversations newest-updatedAt first as a role=listbox', async () => {
		const history = new MockHistoryStore();
		history.seedConversations([
			record('a', 'Older chat', 100),
			record('b', 'Newer chat', 200),
		]);
		const { po } = mountDropdown({ history });
		await po.open();
		await flushPromises();
		expect(po.isListOpen()).toBe(true);
		expect(po.listRole()).toBe('listbox');
		expect(po.rowCount()).toBe(2);
		expect(po.rowRole(0)).toBe('option');
		// Newest first.
		expect(po.rowText(0)).toContain('Newer chat');
		expect(po.rowText(1)).toContain('Older chat');
	});

	it('TEST-TS-011: an empty store shows the quiet empty line', async () => {
		const { po } = mountDropdown();
		await po.open();
		await flushPromises();
		expect(po.isEmptyShown()).toBe(true);
		expect(po.rowCount()).toBe(0);
	});

	it('TEST-TS-013: selecting a row resumes into the active tab (loadIntoTab)', async () => {
		const history = new MockHistoryStore();
		history.seedConversations([record('a', 'Resume me', 100)]);
		const store = useTabsStore();
		const { po } = mountDropdown({ history });
		await po.open();
		await flushPromises();
		await po.clickRow(0);
		await flushPromises();
		expect(store.activeTab?.conversationId).toBe('a');
		expect(store.activeTab?.messages.length).toBeGreaterThan(0);
		expect(store.activeTab?.sessionId).toBe('sess-a');
		// The list closes after resume.
		expect(po.isListOpen()).toBe(false);
	});

	it('TEST-TS-015: ArrowDown moves the selection (aria-activedescendant) and Enter resumes', async () => {
		const history = new MockHistoryStore();
		history.seedConversations([
			record('a', 'First', 300),
			record('b', 'Second', 200),
			record('c', 'Third', 100),
		]);
		const store = useTabsStore();
		const { po } = mountDropdown({ history });
		await po.open();
		await flushPromises();
		await po.keydownList('ArrowDown');
		await po.keydownList('ArrowDown');
		expect(po.rowSelected(2)).toBe('true');
		await po.keydownList('Enter');
		await flushPromises();
		expect(store.activeTab?.conversationId).toBe('c');
	});

	it('TEST-TS-015: Escape closes with no selection and returns focus to the opener', async () => {
		const history = new MockHistoryStore();
		history.seedConversations([record('a', 'A', 100)]);
		const store = useTabsStore();
		const { po } = mountDropdown({ history });
		await po.open();
		await flushPromises();
		await po.keydownList('Escape');
		await flushPromises();
		expect(po.isListOpen()).toBe(false);
		expect(store.activeTab?.conversationId).toBeNull();
		expect(po.openerIsFocused()).toBe(true);
	});

	it('TEST-TS-012: delete opens the confirm seam (never window.confirm) and removes the row', async () => {
		const history = new MockHistoryStore();
		history.seedConversations([record('a', 'Doomed', 100)]);
		const confirmDelete = vi.fn().mockResolvedValue(true);
		const { po } = mountDropdown({ history, confirmDelete });
		await po.open();
		await flushPromises();
		await po.clickDelete(0);
		await flushPromises();
		expect(confirmDelete).toHaveBeenCalledTimes(1);
		const listed = await history.listSessions();
		expect(listed.ok && listed.value.length).toBe(0);
		expect(po.rowCount()).toBe(0);
	});

	it('TEST-TS-012: a declined delete leaves the row intact', async () => {
		const history = new MockHistoryStore();
		history.seedConversations([record('a', 'Spared', 100)]);
		const confirmDelete = vi.fn().mockResolvedValue(false);
		const { po } = mountDropdown({ history, confirmDelete });
		await po.open();
		await flushPromises();
		await po.clickDelete(0);
		await flushPromises();
		expect(confirmDelete).toHaveBeenCalledTimes(1);
		const listed = await history.listSessions();
		expect(listed.ok && listed.value.length).toBe(1);
	});

	it('TEST-TS-011/012: inline rename persists titleManual:true', async () => {
		const history = new MockHistoryStore();
		history.seedConversations([record('a', 'Old name', 100)]);
		const { po } = mountDropdown({ history });
		await po.open();
		await flushPromises();
		await po.clickRename(0);
		expect(po.hasRenameInput()).toBe(true);
		await po.typeRename('New name');
		await flushPromises();
		const hydrated = await history.hydrate('a');
		expect(hydrated.ok && hydrated.value.meta.title).toBe('New name');
		expect(hydrated.ok && hydrated.value.meta.titleManual).toBe(true);
	});
});
