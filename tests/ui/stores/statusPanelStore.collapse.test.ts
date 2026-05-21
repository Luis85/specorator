/**
 * T-MPS-098 — `statusPanelStore.collapsedByThread` persists collapse state per
 * thread across switches.
 *
 * Satisfies REQ-MPS-033, TST-MPS-21.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useStatusPanelStore } from '@/ui/stores/statusPanelStore';

describe('useStatusPanelStore() — collapse state', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('REQ-MPS-033: collapse is keyed by threadId', () => {
		const store = useStatusPanelStore();
		store.setCollapsed('t1', true);
		store.setCollapsed('t2', false);
		expect(store.collapsedByThread.get('t1')).toBe(true);
		expect(store.collapsedByThread.get('t2')).toBe(false);
	});

	it('REQ-MPS-033: resetForThread clears todos+bash but keeps collapse map', () => {
		const store = useStatusPanelStore();
		store.setCollapsed('t1', true);
		store.setTodos([{ id: 'x', title: 'x', status: 'pending', description: null }]);
		store.appendBashEntry({
			id: 'b',
			command: 'ls',
			output: '',
			exitCode: 0,
			timestamp: '2026-05-21T00:00:00.000Z',
			truncated: false,
		});
		store.resetForThread('t1');
		expect(store.todos).toEqual([]);
		expect(store.bashHistory).toEqual([]);
		expect(store.collapsedByThread.get('t1')).toBe(true);
	});
});
