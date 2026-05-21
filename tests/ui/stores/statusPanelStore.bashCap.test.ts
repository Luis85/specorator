/**
 * T-MPS-097 — `statusPanelStore.appendBashEntry` enforces FIFO cap of 50.
 *
 * Satisfies REQ-MPS-031, TST-MPS-20.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useStatusPanelStore, type BashEntry } from '@/ui/stores/statusPanelStore';

function makeEntry(i: number): BashEntry {
	return {
		id: `b${i}`,
		command: `echo ${i}`,
		output: `${i}`,
		exitCode: 0,
		timestamp: `2026-05-21T00:00:${(i % 60).toString().padStart(2, '0')}.000Z`,
		truncated: false,
	};
}

describe('useStatusPanelStore() — bash history FIFO cap', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('REQ-MPS-031: cap is 50 entries; 51st drops the oldest', () => {
		const store = useStatusPanelStore();
		for (let i = 0; i < 51; i++) {
			store.appendBashEntry(makeEntry(i));
		}
		expect(store.bashHistory.length).toBe(50);
		expect(store.bashHistory[0]?.id).toBe('b1');
		expect(store.bashHistory[49]?.id).toBe('b50');
	});

	it('preserves order under the cap', () => {
		const store = useStatusPanelStore();
		store.appendBashEntry(makeEntry(0));
		store.appendBashEntry(makeEntry(1));
		expect(store.bashHistory.map((e) => e.id)).toEqual(['b0', 'b1']);
	});
});
