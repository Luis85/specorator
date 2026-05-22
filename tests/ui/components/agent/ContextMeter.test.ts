/**
 * Tests for `<ContextMeter>` — SVG donut showing context-window usage
 * (REQ-AUX-004, spec §1.3.4).
 *
 * - T-AUX-260: binds `stroke-dashoffset` to `usageFraction`; `stroke` resolves
 *   to brand colour when not in warning state.
 * - T-AUX-261: `isWarning=true` transitions stroke to `--sp-warning`.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';

import ContextMeter from '@/ui/components/agent/ContextMeter.vue';
import { useContextUsageStore } from '@/ui/stores/contextUsageStore';
import { ContextMeterPageObject } from './ContextMeter.po';

const i18n = createI18n({
	legacy: false,
	locale: 'en',
	messages: {
		en: {
			agent: {
				composer: {
					contextMeter: { tooltip: '{used} of {total} tokens used.' },
				},
			},
		},
	},
});

function mountMeter() {
	return mount(ContextMeter, {
		global: { plugins: [i18n] },
		attachTo: document.body,
	});
}

describe('<ContextMeter>', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('T-AUX-260: stroke-dashoffset reflects usageFraction=0.5', () => {
		const store = useContextUsageStore();
		store.setCap('claude', 'sonnet', 1000);
		store.recordTokens(500);

		const wrapper = mountMeter();
		const po = new ContextMeterPageObject(wrapper);
		expect(po.exists()).toBe(true);

		// Default size=18, strokeWidth=2 -> r = (18-2)/2 = 8, C = 2πr ≈ 50.265
		// dashoffset = C * (1 - fraction) ≈ 25.13
		const offset = parseFloat(po.strokeDashoffsetAttr());
		const r = 8;
		const C = 2 * Math.PI * r;
		expect(offset).toBeCloseTo(C * 0.5, 1);
	});

	it('T-AUX-260: idle stroke binds to --sp-brand token', () => {
		const store = useContextUsageStore();
		store.setCap('claude', 'sonnet', 1000);
		store.recordTokens(100);

		const wrapper = mountMeter();
		const po = new ContextMeterPageObject(wrapper);
		expect(po.strokeAttr()).toBe('var(--sp-brand)');
		expect(po.isWarning()).toBe(false);
	});

	it('T-AUX-261: warning state switches stroke to --sp-warning', () => {
		const store = useContextUsageStore();
		store.setCap('claude', 'sonnet', 1000);
		store.recordTokens(900);

		const wrapper = mountMeter();
		const po = new ContextMeterPageObject(wrapper);
		expect(po.isWarning()).toBe(true);
		expect(po.strokeAttr()).toBe('var(--sp-warning)');
	});

	it('renders full track (dashoffset=0) when cap is unknown', () => {
		const store = useContextUsageStore();
		store.recordTokens(500);

		const wrapper = mountMeter();
		const po = new ContextMeterPageObject(wrapper);
		// When fraction is null we render an empty progress arc (offset = C)
		const offset = parseFloat(po.strokeDashoffsetAttr());
		const r = 8;
		const C = 2 * Math.PI * r;
		expect(offset).toBeCloseTo(C, 1);
	});

	it('tooltip interpolates {used} and {total} via composer.contextMeter.tooltip', () => {
		const store = useContextUsageStore();
		store.setCap('claude', 'sonnet', 1000);
		store.recordTokens(250);

		const wrapper = mountMeter();
		const po = new ContextMeterPageObject(wrapper);
		expect(po.tooltipText()).toContain('250');
		expect(po.tooltipText()).toContain('1000');
	});
});
