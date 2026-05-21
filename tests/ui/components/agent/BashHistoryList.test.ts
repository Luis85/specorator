/**
 * T-MPS-101 — `BashHistoryList.vue` renders bash entries from `statusPanelStore`.
 *
 * Satisfies REQ-MPS-031, REQ-MPS-032.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import BashHistoryList from '@/ui/components/agent/BashHistoryList.vue';
import { useStatusPanelStore } from '@/ui/stores/statusPanelStore';
import { i18n } from '@/ui/i18n';
import { BashHistoryListPO } from './BashHistoryList.po';

function mountList() {
	const wrapper = mount(BashHistoryList, { global: { plugins: [i18n] } });
	return { wrapper, po: new BashHistoryListPO(wrapper) };
}

describe('BashHistoryList.vue', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('REQ-MPS-031: shows empty state when no entries', () => {
		const { po } = mountList();
		expect(po.root.exists()).toBe(true);
		expect(po.empty.exists()).toBe(true);
	});

	it('REQ-MPS-031: renders rows with the bash-row-{id} testid', async () => {
		const store = useStatusPanelStore();
		store.appendBashEntry({
			id: 'b1',
			command: 'ls -la',
			output: 'total 0',
			exitCode: 0,
			timestamp: '2026-05-21T00:00:00.000Z',
			truncated: false,
		});
		const { po, wrapper } = mountList();
		await wrapper.vm.$nextTick();
		expect(po.rowsCount()).toBe(1);
		expect(po.row('b1').exists()).toBe(true);
		expect(po.row('b1').text()).toContain('ls -la');
	});

	it('REQ-MPS-032: each row exposes a toggle with aria-controls', async () => {
		const store = useStatusPanelStore();
		store.appendBashEntry({
			id: 'b1',
			command: 'pwd',
			output: '/tmp',
			exitCode: 0,
			timestamp: '2026-05-21T00:00:00.000Z',
			truncated: false,
		});
		const { po, wrapper } = mountList();
		await wrapper.vm.$nextTick();
		const toggle = po.toggle('b1');
		expect(toggle.exists()).toBe(true);
		expect(toggle.attributes('aria-controls')).toBe('bash-row-body-b1');
	});
});
