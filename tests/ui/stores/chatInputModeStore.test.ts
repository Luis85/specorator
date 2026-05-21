/**
 * T-MPS-104, T-MPS-105 — `chatInputModeStore` tests.
 *
 * Satisfies REQ-MPS-036 (plan mode toggle), REQ-MPS-038 (`!` → bangBash),
 * REQ-MPS-039 (`#` → instruction), TST-MPS-24.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useChatInputModeStore } from '@/ui/stores/chatInputModeStore';

describe('useChatInputModeStore()', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('REQ-MPS-038: setFromDraft("!ls") sets bangBashMode=true', () => {
		const store = useChatInputModeStore();
		store.setFromDraft('!ls');
		expect(store.bangBashMode).toBe(true);
		expect(store.instructionMode).toBe(false);
	});

	it('REQ-MPS-039: setFromDraft("#be concise") sets instructionMode=true', () => {
		const store = useChatInputModeStore();
		store.setFromDraft('#be concise');
		expect(store.instructionMode).toBe(true);
		expect(store.bangBashMode).toBe(false);
	});

	it('REQ-MPS-038/039: plain text clears both prefix modes', () => {
		const store = useChatInputModeStore();
		store.setFromDraft('!ls');
		store.setFromDraft('hello');
		expect(store.bangBashMode).toBe(false);
		expect(store.instructionMode).toBe(false);
	});

	it('REQ-MPS-036: togglePlanMode flips planMode', () => {
		const store = useChatInputModeStore();
		expect(store.planMode).toBe(false);
		store.togglePlanMode();
		expect(store.planMode).toBe(true);
		store.togglePlanMode();
		expect(store.planMode).toBe(false);
	});

	it('REQ-MPS-036: planMode is independent from prefix modes', () => {
		const store = useChatInputModeStore();
		store.togglePlanMode();
		store.setFromDraft('!ls');
		expect(store.planMode).toBe(true);
		expect(store.bangBashMode).toBe(true);
	});

	it('reset() clears all three flags', () => {
		const store = useChatInputModeStore();
		store.togglePlanMode();
		store.setFromDraft('!ls');
		store.reset();
		expect(store.planMode).toBe(false);
		expect(store.bangBashMode).toBe(false);
		expect(store.instructionMode).toBe(false);
	});
});
