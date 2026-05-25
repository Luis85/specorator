/**
 * T-TC-021 (RED) — `ThinkingSelector.vue` effort/budget keyboard listbox
 * (TEST-TC-017/018/040 A legs).
 *
 * SPEC-TC-016. Renders nothing on a `hidden` slice (none/single, EC-TC-4); the
 * button shows the current choice — effort → `effortLabel` + the localised level
 * (High/Medium/Low); token-budget → `budgetLabel` + the token amount (REQ-TC-017);
 * opening lists `vm.options` (same listbox a11y as the model selector,
 * keyboard-openable, REQ-TC-040); selecting emits `set(choice)` (REQ-TC-018).
 * Queried by `data-testid` only (ADR-009).
 *
 * Traces: REQ-TC-017/018/040, SPEC-TC-016, NFR-TC-005/006/009.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ThinkingSelector from '@/ui/chat/toolbar/ThinkingSelector.vue';
import { i18n } from '@/ui/i18n';
import type { ThinkingWidgetVm } from '@/application/chat/toolbar/buildToolbarViewModel';
import type { ReasoningChoice } from '@/domain/chat/Reasoning';
import { ThinkingSelectorPageObject } from './ThinkingSelector.po';

const effortOptions: ReasoningChoice[] = [
	{ kind: 'effort', value: 'high' },
	{ kind: 'effort', value: 'medium' },
	{ kind: 'effort', value: 'low' },
];

function mountThinking(vm: ThinkingWidgetVm) {
	const wrapper = mount(ThinkingSelector, {
		props: { vm },
		global: { plugins: [i18n] },
	});
	return { wrapper, po: new ThinkingSelectorPageObject(wrapper) };
}

describe('ThinkingSelector (SPEC-TC-016)', () => {
	it('renders nothing on a hidden slice (EC-TC-4)', () => {
		const { po } = mountThinking({
			visibility: { kind: 'hidden' },
			control: 'none',
			options: [],
		});
		expect(po.buttonExists()).toBe(false);
	});

	it('shows the effort label + the localised level for an effort choice (TEST-TC-017)', () => {
		const { po } = mountThinking({
			visibility: { kind: 'visible', enabled: true },
			control: 'effort',
			options: effortOptions,
			selected: { kind: 'effort', value: 'medium' },
		});
		expect(po.buttonExists()).toBe(true);
		expect(po.buttonRole()).toBe('combobox');
		expect(po.buttonText()).toContain('Effort');
		expect(po.buttonText()).toContain('Medium');
	});

	it('shows the budget label + the token amount for a budget choice (TEST-TC-017)', () => {
		const { po } = mountThinking({
			visibility: { kind: 'visible', enabled: true },
			control: 'token-budget',
			options: [
				{ kind: 'budget', tokens: 1024 },
				{ kind: 'budget', tokens: 4096 },
			],
			selected: { kind: 'budget', tokens: 4096 },
		});
		expect(po.buttonText()).toContain('Budget');
		expect(po.buttonText()).toContain('4096');
	});

	it('opens on click + keyboard and lists the options (TEST-TC-040)', async () => {
		const { po } = mountThinking({
			visibility: { kind: 'visible', enabled: true },
			control: 'effort',
			options: effortOptions,
			selected: { kind: 'effort', value: 'high' },
		});
		await po.pressButton('Enter');
		expect(po.listboxExists()).toBe(true);
		expect(po.optionCount()).toBe(3);
		expect(po.optionText(0)).toContain('High');
	});

	it('arrow-navigates + selects → emits set(choice) (TEST-TC-018)', async () => {
		const { wrapper, po } = mountThinking({
			visibility: { kind: 'visible', enabled: true },
			control: 'effort',
			options: effortOptions,
			selected: { kind: 'effort', value: 'high' },
		});
		await po.pressButton('Enter');
		await po.pressListbox('ArrowDown'); // index 1 → medium
		await po.pressListbox('Enter');
		expect(wrapper.emitted('set')?.[0]).toEqual([{ kind: 'effort', value: 'medium' }]);
	});

	it('selects on click → emits set(choice) (TEST-TC-018)', async () => {
		const { wrapper, po } = mountThinking({
			visibility: { kind: 'visible', enabled: true },
			control: 'effort',
			options: effortOptions,
			selected: { kind: 'effort', value: 'high' },
		});
		await po.clickButton();
		await po.clickOption(2); // low
		expect(wrapper.emitted('set')?.[0]).toEqual([{ kind: 'effort', value: 'low' }]);
	});
});
