/**
 * T-TC-021 (RED) — `ServiceTierToggle.vue` capability-gated zap toggle
 * (TEST-TC-019/020/041 A legs).
 *
 * SPEC-TC-017. Renders nothing on a `hidden` slice (Claude / `!hasServiceTier`
 * → slot collapses, REQ-TC-019, EC-TC-2); the zap toggle shows `vm.active`;
 * toggling emits `toggle(!active)` (REQ-TC-020, declared-now/emitted-P9); is
 * `role="switch"` `aria-checked` with an accessible name (REQ-TC-041). Queried by
 * `data-testid` only (ADR-009).
 *
 * Traces: REQ-TC-019/020/041, SPEC-TC-017, NFR-TC-005/006/009.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ServiceTierToggle from '@/ui/chat/toolbar/ServiceTierToggle.vue';
import { i18n } from '@/ui/i18n';
import type { ServiceTierWidgetVm } from '@/application/chat/toolbar/buildToolbarViewModel';
import { ServiceTierTogglePageObject } from './ServiceTierToggle.po';

const descriptor = { activeValue: 'fast', inactiveValue: 'standard', label: 'Priority' };

function mountTier(vm: ServiceTierWidgetVm) {
	const wrapper = mount(ServiceTierToggle, {
		props: { vm },
		global: { plugins: [i18n] },
	});
	return { wrapper, po: new ServiceTierTogglePageObject(wrapper) };
}

describe('ServiceTierToggle (SPEC-TC-017)', () => {
	it('renders nothing on a hidden slice (EC-TC-2)', () => {
		const { po } = mountTier({ visibility: { kind: 'hidden' }, active: false });
		expect(po.exists()).toBe(false);
	});

	it('is a switch with aria-checked + an accessible name (TEST-TC-041)', () => {
		const { po } = mountTier({
			visibility: { kind: 'visible', enabled: true },
			descriptor,
			active: false,
		});
		expect(po.exists()).toBe(true);
		expect(po.role()).toBe('switch');
		expect(po.checked()).toBe('false');
		expect(po.ariaLabel().length).toBeGreaterThan(0);
	});

	it('reflects active state', () => {
		const { po } = mountTier({
			visibility: { kind: 'visible', enabled: true },
			descriptor,
			active: true,
		});
		expect(po.checked()).toBe('true');
	});

	it('toggling from inactive emits toggle(true) (TEST-TC-020)', async () => {
		const { wrapper, po } = mountTier({
			visibility: { kind: 'visible', enabled: true },
			descriptor,
			active: false,
		});
		await po.click();
		expect(wrapper.emitted('toggle')?.[0]).toEqual([true]);
	});

	it('toggling from active emits toggle(false) (TEST-TC-020)', async () => {
		const { wrapper, po } = mountTier({
			visibility: { kind: 'visible', enabled: true },
			descriptor,
			active: true,
		});
		await po.click();
		expect(wrapper.emitted('toggle')?.[0]).toEqual([false]);
	});
});
