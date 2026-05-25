/**
 * T-TS-028 (RED) — `TabBar.vue` + tab badge (TEST-TS-006/008/009 A legs +
 * TEST-TS-026 number cue / state classes).
 *
 * SPEC-TS-020, REQ-TS-001..007, NFR-TS-009/010. A strip of numbered square badges
 * (`role="tablist"`/`role="tab"`/`aria-selected`, 1-based number visible text), a
 * new-tab + per-badge close control, roving tabindex (Arrow Left/Right activate,
 * Home/End jump), and the border-colour state machine via `data-state`
 * (active/streaming/attention/idle). Queried by `data-testid` only (ADR-009).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import TabBar from '@/ui/chat/TabBar.vue';
import { useTabsStore } from '@/ui/stores/tabsStore';
import type { ChatTurnRunner } from '@/ui/stores/chatStore';
import { i18n } from '@/ui/i18n';
import { ok } from '@/domain/shared/Result';
import { MockChatRuntime } from '@/infrastructure/mock/MockChatRuntime';
import { MockHistoryStore } from '@/infrastructure/mock/MockHistoryStore';
import { TabBarPageObject } from './TabBar.po';

function fakeRunner(): ChatTurnRunner {
	return { run: vi.fn().mockResolvedValue(ok(undefined)), cancel: vi.fn() };
}

function bindStore(maxTabs = 3) {
	const store = useTabsStore();
	store.bindTabDeps({
		createRuntime: () => new MockChatRuntime([]),
		createRunner: () => fakeRunner(),
		notifyStartFailure: () => undefined,
		notifyInfo: () => undefined,
		history: new MockHistoryStore(),
		generateTitle: () => Promise.resolve(ok('title')),
		getMaxTabs: () => maxTabs,
	});
	return store;
}

function mountBar() {
	const wrapper = mount(TabBar, { global: { plugins: [i18n] } });
	return { wrapper, po: new TabBarPageObject(wrapper) };
}

describe('TabBar (SPEC-TS-020)', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('renders a tablist with an aria-label and a new-tab control', () => {
		bindStore();
		const { po } = mountBar();
		expect(po.exists()).toBe(true);
		expect(po.role()).toBe('tablist');
		expect((po.ariaLabel() ?? '').length).toBeGreaterThan(0);
		expect(po.hasNew()).toBe(true);
	});

	it('TEST-TS-026: each badge is a role=tab carrying its 1-based number as visible text', () => {
		const store = bindStore();
		store.openTab();
		store.openTab();
		const { po } = mountBar();
		expect(po.badgeCount()).toBe(3);
		expect(po.badgeNumbers()).toEqual(['1', '2', '3']);
		expect(po.badgeRole(0)).toBe('tab');
	});

	it('TEST-TS-006: clicking the new-tab control opens a tab', async () => {
		bindStore();
		const { po } = mountBar();
		expect(po.badgeCount()).toBe(1);
		await po.clickNew();
		expect(po.badgeCount()).toBe(2);
	});

	it('TEST-TS-009: roving tabindex — active badge 0, the rest -1; aria-selected tracks active', async () => {
		const store = bindStore();
		store.openTab(); // tab 2 active
		const { po } = mountBar();
		// Tab 2 (index 1) active.
		expect(po.badgeTabindex(1)).toBe('0');
		expect(po.badgeTabindex(0)).toBe('-1');
		expect(po.badgeSelected(1)).toBe('true');
		expect(po.badgeSelected(0)).toBe('false');
	});

	it('TEST-TS-009: clicking a badge activates it (switchTab)', async () => {
		const store = bindStore();
		store.openTab();
		const { po } = mountBar();
		await po.clickBadge(0);
		expect(store.activeTabId).toBe(store.tabs[0].id);
		expect(po.badgeSelected(0)).toBe('true');
	});

	it('TEST-TS-009: ArrowRight/ArrowLeft move + activate; Home/End jump to first/last', async () => {
		const store = bindStore();
		store.openTab();
		store.openTab(); // three tabs, third active
		store.switchTab(store.tabs[0].id);
		const { po } = mountBar();
		await po.keydownBadge(0, 'ArrowRight');
		expect(store.activeTabId).toBe(store.tabs[1].id);
		await po.keydownBadge(1, 'ArrowLeft');
		expect(store.activeTabId).toBe(store.tabs[0].id);
		await po.keydownBadge(0, 'End');
		expect(store.activeTabId).toBe(store.tabs[2].id);
		await po.keydownBadge(2, 'Home');
		expect(store.activeTabId).toBe(store.tabs[0].id);
	});

	it('TEST-TS-008: per-badge close removes the tab', async () => {
		const store = bindStore();
		store.openTab();
		const { po } = mountBar();
		expect(po.badgeCount()).toBe(2);
		await po.clickClose(1);
		expect(po.badgeCount()).toBe(1);
		expect(store.tabs).toHaveLength(1);
	});

	it('TEST-TS-009: badge state machine — active, streaming, attention, idle', async () => {
		const store = bindStore();
		store.openTab(); // B active
		const a = store.tabs[0];
		const b = store.tabs[1];
		const { po } = mountBar();
		// B active.
		expect(po.badgeState(1)).toBe('active');
		expect(po.badgeState(0)).toBe('idle');
		// A streaming in the background.
		a.status = 'streaming';
		await po.wrapperNextTick();
		expect(po.badgeState(0)).toBe('streaming');
		// A finishes + needs attention while non-active.
		a.status = 'idle';
		b.needsAttention = false;
		store.markAttention(a.id);
		await po.wrapperNextTick();
		expect(po.badgeState(0)).toBe('attention');
	});
});
