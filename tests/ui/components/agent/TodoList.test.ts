/**
 * T-MPS-101 — `TodoList.vue` renders todos from `statusPanelStore`.
 *
 * Satisfies REQ-MPS-030.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import TodoList from '@/ui/components/agent/TodoList.vue';
import { useStatusPanelStore } from '@/ui/stores/statusPanelStore';
import { i18n } from '@/ui/i18n';
import { TodoListPO } from './TodoList.po';

function mountList() {
	const wrapper = mount(TodoList, { global: { plugins: [i18n] } });
	return { wrapper, po: new TodoListPO(wrapper) };
}

describe('TodoList.vue', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('REQ-MPS-030: renders empty state when no todos', () => {
		const { po } = mountList();
		expect(po.root.exists()).toBe(true);
		expect(po.empty.exists()).toBe(true);
	});

	it('REQ-MPS-030: renders one row per todo with data-testid="todo-row-{id}"', async () => {
		const store = useStatusPanelStore();
		store.setTodos([
			{ id: 'alpha', title: 'Alpha', status: 'pending', description: null },
			{ id: 'beta', title: 'Beta', status: 'in-progress', description: 'work' },
		]);
		const { po, wrapper } = mountList();
		await wrapper.vm.$nextTick();
		expect(po.rowsCount()).toBe(2);
		expect(po.row('alpha').exists()).toBe(true);
		expect(po.row('alpha').text()).toContain('Alpha');
		expect(po.row('beta').exists()).toBe(true);
	});
});
