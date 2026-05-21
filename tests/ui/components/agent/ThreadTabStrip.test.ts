/**
 * T-MPS-077 + T-MPS-078 — `ThreadTabStrip.vue`.
 *
 * Verifies ordering (lastUsedAt desc), activation, new-thread button, the
 * tab-cap warning (REQ-MPS-025), and arrow-key navigation (NFR-MPS-009).
 *
 * Satisfies REQ-MPS-018, REQ-MPS-019, REQ-MPS-025, NFR-MPS-009.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';

import ThreadTabStrip from '@/ui/components/agent/ThreadTabStrip.vue';
import { useChatThreadsStore } from '@/ui/stores/chatThreadsStore';
import { i18n } from '@/ui/i18n';
import type { ChatThreadRecord } from '@/domain/chat/ChatThreadRecord';
import { ThreadTabStripPO } from './ThreadTabStrip.po';

function makeThread(
	threadId: string,
	overrides: Partial<ChatThreadRecord> = {},
): ChatThreadRecord {
	return {
		threadId,
		sessionId: null,
		feature: null,
		logPath: `specs/_chat/${threadId}.md`,
		transport: { provider: 'claude', mode: 'cli' },
		title: threadId,
		forkParent: null,
		createdAt: '2026-05-14T00:00:00.000Z',
		lastUsedAt: '2026-05-14T00:00:00.000Z',
		...overrides,
	};
}

function mountStrip(props: { onNewThread?: () => void; onTabCapHit?: () => void } = {}) {
	const wrapper = mount(ThreadTabStrip, {
		global: { plugins: [i18n] },
		props,
	});
	return { wrapper, po: new ThreadTabStripPO(wrapper) };
}

describe('ThreadTabStrip', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	describe('rendering + ordering (REQ-MPS-018, TST-MPS-10)', () => {
		it('renders the tablist root with the canonical data-testid', () => {
			const { po } = mountStrip();
			expect(po.root.exists()).toBe(true);
		});

		it('carries role="tablist" with a localised aria-label', () => {
			const { po } = mountStrip();
			expect(po.root.attributes('role')).toBe('tablist');
			expect(po.root.attributes('aria-label')).toBe('Open conversation threads');
		});

		it('renders three tabs ordered by lastUsedAt descending', () => {
			const store = useChatThreadsStore();
			store.upsertThread(
				makeThread('t1', { lastUsedAt: '2026-05-10T00:00:00.000Z' }),
			);
			store.upsertThread(
				makeThread('t2', { lastUsedAt: '2026-05-15T00:00:00.000Z' }),
			);
			store.upsertThread(
				makeThread('t3', { lastUsedAt: '2026-05-12T00:00:00.000Z' }),
			);
			const { po } = mountStrip();
			expect(po.tabIdsInOrder()).toEqual(['t2', 't3', 't1']);
		});

		it('renders the new-thread button after the tabs', () => {
			const { po } = mountStrip();
			expect(po.newThreadButton.exists()).toBe(true);
		});
	});

	describe('activation (REQ-MPS-018)', () => {
		it('dispatches setActiveThreadId(id) when a non-active tab is clicked', async () => {
			const store = useChatThreadsStore();
			store.upsertThread(makeThread('t1'));
			store.upsertThread(makeThread('t2'));
			store.setActiveThreadId('t1');
			const { po } = mountStrip();
			await po.clickTab('t2');
			expect(store.activeThreadId).toBe('t2');
		});
	});

	describe('new-thread button (REQ-MPS-019, REQ-MPS-025)', () => {
		it('emits "new-thread" when clicked', async () => {
			const onNewThread = vi.fn();
			const { po } = mountStrip({ onNewThread });
			await po.clickNewThread();
			expect(onNewThread).toHaveBeenCalledTimes(1);
		});

		it('is disabled when the tab count equals the cap (REQ-MPS-025)', async () => {
			const store = useChatThreadsStore();
			for (let i = 0; i < 10; i++) {
				store.upsertThread(makeThread(`t${i}`));
			}
			const { po } = mountStrip();
			expect(po.newThreadButton.attributes('disabled')).toBeDefined();
		});

		it('is enabled when below the cap', () => {
			const store = useChatThreadsStore();
			store.upsertThread(makeThread('t1'));
			const { po } = mountStrip();
			expect(po.newThreadButton.attributes('disabled')).toBeUndefined();
		});
	});

	describe('arrow-key navigation (NFR-MPS-009, T-MPS-078)', () => {
		function setupThreeTabs(): {
			wrapper: VueWrapper;
			po: ThreadTabStripPO;
		} {
			const store = useChatThreadsStore();
			store.upsertThread(
				makeThread('t1', { lastUsedAt: '2026-05-15T00:00:00.000Z' }),
			);
			store.upsertThread(
				makeThread('t2', { lastUsedAt: '2026-05-14T00:00:00.000Z' }),
			);
			store.upsertThread(
				makeThread('t3', { lastUsedAt: '2026-05-13T00:00:00.000Z' }),
			);
			store.setActiveThreadId('t1');
			return mountStrip();
		}

		it('seeds roving tabindex 0 on the active tab', () => {
			const { po } = setupThreeTabs();
			expect(po.focusedTabId()).toBe('t1');
		});

		it('ArrowRight moves focus to the next tab in DOM order', async () => {
			const { po } = setupThreeTabs();
			await po.pressKey('t1', 'ArrowRight');
			expect(po.focusedTabId()).toBe('t2');
		});

		it('ArrowLeft moves focus to the previous tab', async () => {
			const { po } = setupThreeTabs();
			await po.pressKey('t1', 'ArrowRight');
			await po.pressKey('t2', 'ArrowLeft');
			expect(po.focusedTabId()).toBe('t1');
		});

		it('ArrowRight wraps from the last tab back to the first', async () => {
			const { po } = setupThreeTabs();
			await po.pressKey('t1', 'ArrowRight'); // -> t2
			await po.pressKey('t2', 'ArrowRight'); // -> t3
			await po.pressKey('t3', 'ArrowRight'); // -> t1
			expect(po.focusedTabId()).toBe('t1');
		});

		it('ArrowLeft wraps from the first tab to the last', async () => {
			const { po } = setupThreeTabs();
			await po.pressKey('t1', 'ArrowLeft');
			expect(po.focusedTabId()).toBe('t3');
		});

		it('Home jumps focus to the first tab', async () => {
			const { po } = setupThreeTabs();
			await po.pressKey('t1', 'ArrowRight'); // -> t2
			await po.pressKey('t2', 'ArrowRight'); // -> t3
			await po.pressKey('t3', 'Home');
			expect(po.focusedTabId()).toBe('t1');
		});

		it('End jumps focus to the last tab', async () => {
			const { po } = setupThreeTabs();
			await po.pressKey('t1', 'End');
			expect(po.focusedTabId()).toBe('t3');
		});

		it('Enter on a focused non-active tab activates it', async () => {
			const store = useChatThreadsStore();
			const { po } = setupThreeTabs();
			await po.pressKey('t1', 'ArrowRight'); // focus t2
			await po.pressKey('t2', 'Enter');
			expect(store.activeThreadId).toBe('t2');
		});
	});

	describe('thread-tab-active alias', () => {
		it('resolves to the active tab when one exists', () => {
			const store = useChatThreadsStore();
			store.upsertThread(makeThread('t1'));
			store.upsertThread(makeThread('t2'));
			store.setActiveThreadId('t2');
			const { po } = mountStrip();
			expect(po.activeTab.exists()).toBe(true);
		});
	});
});
