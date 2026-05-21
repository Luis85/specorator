/**
 * T-MPS-096 — `statusPanelStore.setTodos` replaces the todos list verbatim.
 *
 * Satisfies REQ-MPS-030, TST-MPS-19.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useStatusPanelStore } from '@/ui/stores/statusPanelStore';
import type { TodoEntry } from '@/domain/ports/ChatTransportPort';

describe('useStatusPanelStore() — todos', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('REQ-MPS-030: initial todos is an empty array', () => {
		const store = useStatusPanelStore();
		expect(store.todos).toEqual([]);
	});

	it('REQ-MPS-030: setTodos replaces the list', () => {
		const store = useStatusPanelStore();
		const next: TodoEntry[] = [
			{ id: 't1', title: 'first', status: 'pending', description: null },
			{ id: 't2', title: 'second', status: 'in-progress', description: 'doing it' },
		];
		store.setTodos(next);
		expect(store.todos).toEqual(next);
	});

	it('REQ-MPS-030: subsequent setTodos replaces (does not append)', () => {
		const store = useStatusPanelStore();
		store.setTodos([{ id: 'a', title: 'A', status: 'pending', description: null }]);
		store.setTodos([{ id: 'b', title: 'B', status: 'done', description: null }]);
		expect(store.todos.length).toBe(1);
		expect(store.todos[0]?.id).toBe('b');
	});
});
