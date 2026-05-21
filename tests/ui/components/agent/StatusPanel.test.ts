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
});
