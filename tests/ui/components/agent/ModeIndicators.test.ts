/**
 * Tests for `<ModeIndicators>` (REQ-MPS-036/038/039 + G4.3 brand splash).
 *
 *   G4.3 — When a mode chip is active, it carries the brand-active
 *          modifier class so border + text take on `--sp-brand`. Inactive
 *          chips stay muted.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';

import ModeIndicators from '@/ui/components/agent/ModeIndicators.vue';
import { useChatInputModeStore } from '@/ui/stores/chatInputModeStore';
import { i18n } from '@/ui/i18n';
import { ModeIndicatorsPageObject } from './ModeIndicators.po';

function mountIndicators() {
	const wrapper = mount(ModeIndicators, {
		global: { plugins: [i18n] },
	});
	return { wrapper, po: new ModeIndicatorsPageObject(wrapper) };
}

describe('<ModeIndicators>', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('G4.3: plan chip carries the brand-active modifier when planMode is on', async () => {
		const store = useChatInputModeStore();
		store.planMode = true;
		const { po, wrapper } = mountIndicators();
		await wrapper.vm.$nextTick();
		expect(po.planChipClasses()).toContain('sp-mode-indicators__chip--active');
	});

	it('G4.3: bang-bash chip carries the brand-active modifier when bangBashMode is on', async () => {
		const store = useChatInputModeStore();
		store.bangBashMode = true;
		const { po, wrapper } = mountIndicators();
		await wrapper.vm.$nextTick();
		expect(po.bangBashChipClasses()).toContain('sp-mode-indicators__chip--active');
	});

	it('G4.3: instruction chip carries the brand-active modifier when instructionMode is on', async () => {
		const store = useChatInputModeStore();
		store.instructionMode = true;
		const { po, wrapper } = mountIndicators();
		await wrapper.vm.$nextTick();
		expect(po.instructionChipClasses()).toContain('sp-mode-indicators__chip--active');
	});
});
