/**
 * T-TC-019 (RED) — `ModeSelector.vue` descriptor-driven two-option toggle
 * (TEST-TC-013/014/041 A legs).
 *
 * SPEC-TC-014. Returns nothing on a `hidden` slice (guard, REQ-TC-013); shows
 * the active/inactive label per `vm.activeValue`; toggling flips to the other
 * option value → `set` emit (REQ-TC-014); is `role="switch"` `aria-checked` with
 * an accessible name (REQ-TC-041). Queried by `data-testid` only (ADR-009).
 *
 * Traces: REQ-TC-013/014/041, SPEC-TC-014, NFR-TC-005/006/009.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ModeSelector from '@/ui/chat/toolbar/ModeSelector.vue';
import { i18n } from '@/ui/i18n';
import type { ModeWidgetVm } from '@/application/chat/toolbar/buildToolbarViewModel';
import { ModeSelectorPageObject } from './ModeSelector.po';

const descriptor = {
	activeValue: 'accept-edits',
	inactiveValue: 'default',
	activeLabel: 'Accept edits',
	inactiveLabel: 'Default',
};

function mountMode(vm: ModeWidgetVm) {
	const wrapper = mount(ModeSelector, {
		props: { vm },
		global: { plugins: [i18n] },
	});
	return { wrapper, po: new ModeSelectorPageObject(wrapper) };
}

describe('ModeSelector (SPEC-TC-014)', () => {
	it('renders nothing on a hidden slice (REQ-TC-013)', () => {
		const { po } = mountMode({ visibility: { kind: 'hidden' } });
		expect(po.exists()).toBe(false);
	});

	it('is a switch with aria-checked + an accessible name when inactive (TEST-TC-013/041)', () => {
		const { po } = mountMode({
			visibility: { kind: 'visible', enabled: true },
			descriptor,
			activeValue: 'default',
		});
		expect(po.exists()).toBe(true);
		expect(po.role()).toBe('switch');
		expect(po.checked()).toBe('false');
		expect(po.ariaLabel().length).toBeGreaterThan(0);
		expect(po.text()).toContain('Default');
	});

	it('reflects aria-checked=true + the active label when active', () => {
		const { po } = mountMode({
			visibility: { kind: 'visible', enabled: true },
			descriptor,
			activeValue: 'accept-edits',
		});
		expect(po.checked()).toBe('true');
		expect(po.text()).toContain('Accept edits');
	});

	it('toggling from inactive emits set with the active value (TEST-TC-014)', async () => {
		const { wrapper, po } = mountMode({
			visibility: { kind: 'visible', enabled: true },
			descriptor,
			activeValue: 'default',
		});
		await po.click();
		expect(wrapper.emitted('set')?.[0]).toEqual(['accept-edits']);
	});

	it('toggling from active emits set with the inactive value (TEST-TC-014)', async () => {
		const { wrapper, po } = mountMode({
			visibility: { kind: 'visible', enabled: true },
			descriptor,
			activeValue: 'accept-edits',
		});
		await po.click();
		expect(wrapper.emitted('set')?.[0]).toEqual(['default']);
	});
});
