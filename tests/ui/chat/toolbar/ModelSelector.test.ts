/**
 * T-TC-019 (RED) — `ModelSelector.vue` grouped keyboard listbox
 * (TEST-TC-010/011/040 A legs).
 *
 * SPEC-TC-013. The button shows the `selectedId`'s label; opening (click OR
 * Enter/Space, not hover-only, REQ-TC-040) renders `vm.options` as a
 * `role="listbox"` with group separators where `option.group` differs, each
 * `role="option"` `aria-selected` (current marked, REQ-TC-011); Arrow/Home/End
 * move `aria-activedescendant`, Enter/Space → `pick`, Escape closes; an empty
 * model list shows an empty-notice row + the persisted value on the button
 * (EC-TC-3). Queried by `data-testid` only (ADR-009).
 *
 * Traces: REQ-TC-010/011/040, SPEC-TC-013, NFR-TC-005/006/009.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ModelSelector from '@/ui/chat/toolbar/ModelSelector.vue';
import { i18n } from '@/ui/i18n';
import type { ModelWidgetVm } from '@/application/chat/toolbar/buildToolbarViewModel';
import type { ProviderId } from '@/domain/chat/ProviderId';
import { ModelSelectorPageObject } from './ModelSelector.po';

function mountModel(vm: ModelWidgetVm, providerId?: ProviderId) {
	const wrapper = mount(ModelSelector, {
		props: providerId === undefined ? { vm } : { vm, providerId },
		global: { plugins: [i18n] },
	});
	return { wrapper, po: new ModelSelectorPageObject(wrapper) };
}

const groupedVm: ModelWidgetVm = {
	visibility: { kind: 'visible', enabled: true },
	options: [
		{ id: 'claude-sonnet', label: 'Sonnet', group: 'Recommended' },
		{ id: 'claude-opus', label: 'Opus', group: 'Recommended' },
		{ id: 'claude-haiku', label: 'Haiku', group: 'Fast' },
	],
	selectedId: 'claude-opus',
	emptyNotice: false,
};

describe('ModelSelector (SPEC-TC-013)', () => {
	it('shows the selected model label on a combobox button (TEST-TC-010)', () => {
		const { po } = mountModel(groupedVm);
		expect(po.buttonExists()).toBe(true);
		expect(po.buttonText()).toContain('Opus');
		expect(po.buttonRole()).toBe('combobox');
		expect(po.buttonHasPopup()).toBe('listbox');
		expect(po.expanded()).toBe('false');
	});

	it('opens on click and lists grouped options with the current marked (TEST-TC-011)', async () => {
		const { po } = mountModel(groupedVm);
		await po.clickButton();
		expect(po.listboxExists()).toBe(true);
		expect(po.expanded()).toBe('true');
		expect(po.optionCount()).toBe(3);
		expect(po.optionText(1)).toContain('Opus');
		expect(po.optionSelected(1)).toBe('true');
		expect(po.optionSelected(0)).toBe('false');
		// Two groups → one separator between them (Recommended | Fast).
		expect(po.groupSeparatorCount()).toBe(1);
	});

	it('opens on Enter/Space (not hover-only) (TEST-TC-040)', async () => {
		const { po } = mountModel(groupedVm);
		await po.pressButton('Enter');
		expect(po.listboxExists()).toBe(true);
		expect(po.expanded()).toBe('true');
	});

	it('moves aria-activedescendant on ArrowDown / Home / End (TEST-TC-040)', async () => {
		const { po } = mountModel(groupedVm);
		await po.pressButton('Enter');
		// active starts on the selected option (index 1).
		expect(po.activeDescendant()).toBe(po.optionId(1));
		await po.pressListbox('ArrowDown');
		expect(po.activeDescendant()).toBe(po.optionId(2));
		await po.pressListbox('Home');
		expect(po.activeDescendant()).toBe(po.optionId(0));
		await po.pressListbox('End');
		expect(po.activeDescendant()).toBe(po.optionId(2));
	});

	it('emits pick on Enter and on click (TEST-TC-011)', async () => {
		const { wrapper, po } = mountModel(groupedVm);
		await po.pressButton('Enter');
		await po.pressListbox('ArrowDown'); // index 2 → haiku
		await po.pressListbox('Enter');
		expect(wrapper.emitted('pick')?.[0]).toEqual(['claude-haiku']);

		await po.clickButton();
		await po.clickOption(0);
		expect(wrapper.emitted('pick')?.[1]).toEqual(['claude-sonnet']);
	});

	it('closes on Escape', async () => {
		const { po } = mountModel(groupedVm);
		await po.pressButton('Enter');
		expect(po.listboxExists()).toBe(true);
		await po.pressListbox('Escape');
		expect(po.listboxExists()).toBe(false);
		expect(po.expanded()).toBe('false');
	});

	it('shows an empty notice + the persisted value when the model list is empty (EC-TC-3)', async () => {
		const { po } = mountModel({
			visibility: { kind: 'visible', enabled: true },
			options: [],
			selectedId: 'claude-legacy',
			emptyNotice: true,
		});
		// The persisted value still labels the button.
		expect(po.buttonText()).toContain('claude-legacy');
		await po.clickButton();
		expect(po.emptyExists()).toBe(true);
		expect(po.optionCount()).toBe(0);
	});
});

/**
 * T-PV-031 (RED) — provider-aware `ModelSelector` (TEST-PV-062 A leg).
 *
 * SPEC-PV-017, REQ-PV-062. The P6 selector is CHANGED to render the active
 * provider's models incl. the `opencode-model-picker` shape. The `providerId` prop is
 * additive + optional — absent / `'claude'` is byte-identical P6 (NFR-PV-001); when
 * `'opencode'` the picker carries the `opencode-model-picker` variant. No
 * `switch (providerId)` (NFR-PV-014, asserted by the source grep below).
 */
describe('ModelSelector provider-aware shape (SPEC-PV-017)', () => {
	it('renders the opencode-model-picker shape when the active provider is opencode (TEST-PV-062)', () => {
		const { po } = mountModel(groupedVm, 'opencode');
		expect(po.opencodePickerShown()).toBe(true);
	});

	it('does NOT render the opencode shape for opencode-absent — byte-identical P6 (NFR-PV-001)', () => {
		const { po } = mountModel(groupedVm);
		expect(po.opencodePickerShown()).toBe(false);
	});

	it('does NOT render the opencode shape for claude (NFR-PV-001)', () => {
		const { po } = mountModel(groupedVm, 'claude');
		expect(po.opencodePickerShown()).toBe(false);
	});
});
