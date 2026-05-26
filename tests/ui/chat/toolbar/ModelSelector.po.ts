import type { VueWrapper } from '@vue/test-utils';

const TID = {
	root: 'toolbar-model',
	option: 'toolbar-model-option',
	empty: 'toolbar-model-empty',
	opencodePicker: 'opencode-model-picker',
} as const;

/** PageObject for `ModelSelector.vue` (SPEC-TC-013). Queries by `data-testid` only (ADR-009). */
export class ModelSelectorPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	buttonExists(): boolean {
		return this.wrapper.find(this.byTid(TID.root)).exists();
	}

	/** The combobox button's visible label (the selected model). */
	buttonText(): string {
		return this.wrapper.get(this.byTid(TID.root)).text();
	}

	buttonRole(): string {
		return this.wrapper.get(this.byTid(TID.root)).attributes('role') ?? '';
	}

	buttonHasPopup(): string {
		return this.wrapper.get(this.byTid(TID.root)).attributes('aria-haspopup') ?? '';
	}

	expanded(): string {
		return this.wrapper.get(this.byTid(TID.root)).attributes('aria-expanded') ?? '';
	}

	buttonAriaLabel(): string {
		return this.wrapper.get(this.byTid(TID.root)).attributes('aria-label') ?? '';
	}

	listboxExists(): boolean {
		return this.wrapper.find('[role="listbox"]').exists();
	}

	optionCount(): number {
		return this.wrapper.findAll(this.byTid(TID.option)).length;
	}

	optionText(index: number): string {
		return this.wrapper.findAll(this.byTid(TID.option))[index].text();
	}

	optionSelected(index: number): string {
		return this.wrapper.findAll(this.byTid(TID.option))[index].attributes('aria-selected') ?? '';
	}

	/** The `aria-activedescendant` id currently on the listbox. */
	activeDescendant(): string {
		return this.wrapper.get('[role="listbox"]').attributes('aria-activedescendant') ?? '';
	}

	/** The dom id of the option at `index` (to compare against activeDescendant). */
	optionId(index: number): string {
		return this.wrapper.findAll(this.byTid(TID.option))[index].attributes('id') ?? '';
	}

	/** The number of presentation group separators. */
	groupSeparatorCount(): number {
		return this.wrapper.findAll('[role="presentation"]').length;
	}

	emptyExists(): boolean {
		return this.wrapper.find(this.byTid(TID.empty)).exists();
	}

	/** True when the per-provider Opencode picker shape is rendered (REQ-PV-062). */
	opencodePickerShown(): boolean {
		return this.wrapper.find(this.byTid(TID.opencodePicker)).exists();
	}

	async clickButton(): Promise<void> {
		await this.wrapper.get(this.byTid(TID.root)).trigger('click');
	}

	async pressButton(key: string): Promise<void> {
		await this.wrapper.get(this.byTid(TID.root)).trigger('keydown', { key });
	}

	async pressListbox(key: string): Promise<void> {
		await this.wrapper.get('[role="listbox"]').trigger('keydown', { key });
	}

	async clickOption(index: number): Promise<void> {
		await this.wrapper.findAll(this.byTid(TID.option))[index].trigger('click');
	}

	rootHtml(): string {
		return this.wrapper.get(this.byTid(TID.root)).html();
	}
}
