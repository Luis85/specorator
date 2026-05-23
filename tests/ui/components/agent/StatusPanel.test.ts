/**
 * T-MPS-101 — `StatusPanel.vue` container behaviour: collapse toggle keyed on
 * the active thread via `statusPanelStore.collapsedByThread`.
 *
 * Satisfies REQ-MPS-033, TST-MPS-21.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import StatusPanel from '@/ui/components/agent/StatusPanel.vue';
import { useStatusPanelStore } from '@/ui/stores/statusPanelStore';
import { useChatThreadsStore } from '@/ui/stores/chatThreadsStore';
import { i18n } from '@/ui/i18n';
import { StatusPanelPO } from './StatusPanel.po';

function mountPanel() {
	// G5 polish: StatusPanel hides itself when both task list AND bashHistory
	// are empty (Claudian parity — don't earn screen real estate for
	// nothing). Seed one task so the panel renders for the collapse /
	// scroll-cap tests.
	const status = useStatusPanelStore();
	status.setTodos([
		{ id: 't-1', title: 'placeholder', status: 'pending', description: null },
	]);
	const wrapper = mount(StatusPanel, { global: { plugins: [i18n] } });
	return { wrapper, po: new StatusPanelPO(wrapper) };
}

describe('StatusPanel.vue', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('REQ-MPS-033: renders the panel root and header', () => {
		const { po } = mountPanel();
		expect(po.root.exists()).toBe(true);
		expect(po.header.exists()).toBe(true);
	});

	it('REQ-MPS-033: clicking the header toggles per-thread collapse', async () => {
		const threads = useChatThreadsStore();
		threads.setActiveThreadId('thread-A');
		const status = useStatusPanelStore();
		const { po, wrapper } = mountPanel();
		await wrapper.vm.$nextTick();
		expect(po.headerAriaExpanded()).toBe('true');
		await po.clickHeader();
		expect(status.collapsedByThread.get('thread-A')).toBe(true);
		expect(po.headerAriaExpanded()).toBe('false');
	});

	it('REQ-MPS-033: collapse state survives a thread switch (re-read)', async () => {
		const threads = useChatThreadsStore();
		const status = useStatusPanelStore();
		threads.setActiveThreadId('thread-A');
		status.setCollapsed('thread-A', true);
		const { po, wrapper } = mountPanel();
		await wrapper.vm.$nextTick();
		expect(po.headerAriaExpanded()).toBe('false');
		threads.setActiveThreadId('thread-B');
		await wrapper.vm.$nextTick();
		// thread-B starts expanded (no entry in the map)
		expect(po.headerAriaExpanded()).toBe('true');
		threads.setActiveThreadId('thread-A');
		await wrapper.vm.$nextTick();
		expect(po.headerAriaExpanded()).toBe('false');
	});

	it('T-AUX-286 REQ-AUX-011: body owns its scroll with `min(40vh, 320px)` max-height', async () => {
		const threads = useChatThreadsStore();
		threads.setActiveThreadId('thread-A');
		const { po, wrapper } = mountPanel();
		await wrapper.vm.$nextTick();
		// body exists and is expanded
		expect(po.body.exists()).toBe(true);
		// Inline source assertion: jsdom's getComputedStyle doesn't honour
		// scoped styles in the same way the browser does. We read the SFC
		// source so the assertion is robust to scoping.
		const fs = await import('node:fs/promises');
		const path = await import('node:path');
		const src = await fs.readFile(
			path.resolve(__dirname, '../../../../src/ui/components/agent/StatusPanel.vue'),
			'utf8',
		);
		// max-height token: min(40vh, 320px)
		expect(src).toMatch(/max-height:\s*min\(\s*40vh\s*,\s*320px\s*\)/);
		// own scroll container behaviour: overflow-y + overscroll-behavior contain
		expect(src).toMatch(/overflow-y:\s*auto/);
		expect(src).toMatch(/overscroll-behavior:\s*contain/);
	});
});
