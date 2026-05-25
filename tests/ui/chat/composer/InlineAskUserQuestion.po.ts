import type { VueWrapper } from '@vue/test-utils';

const TID = {
	root: 'inline-ask',
	tab: 'inline-ask-tab',
	option: 'inline-ask-option',
	custom: 'inline-ask-custom',
	readonly: 'inline-ask-readonly',
} as const;

/** PageObject for `InlineAskUserQuestion.vue` (SPEC-CP-022). Queries by `data-testid` only (ADR-009). */
export class InlineAskUserQuestionPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	exists(): boolean {
		return this.wrapper.find(this.byTid(TID.root)).exists();
	}

	get root() {
		return this.wrapper.get(this.byTid(TID.root));
	}

	tabCount(): number {
		return this.wrapper.findAll(`[data-testid^="${TID.tab}-"]`).length;
	}

	tab(i: number) {
		return this.wrapper.get(this.byTid(`${TID.tab}-${i}`));
	}

	optionCount(): number {
		return this.wrapper.findAll(`[data-testid^="${TID.option}-"]`).length;
	}

	option(i: number) {
		return this.wrapper.get(this.byTid(`${TID.option}-${i}`));
	}

	optionText(i: number): string {
		return this.option(i).text();
	}

	/** True when an option carries the focused-state marker. */
	optionFocused(i: number): boolean {
		return this.option(i).attributes('aria-selected') === 'true';
	}

	hasCustomInput(): boolean {
		return this.wrapper.find(this.byTid(TID.custom)).exists();
	}

	get customInput() {
		return this.wrapper.get(this.byTid(TID.custom));
	}

	/** The read-only banner shown when `supportsInlineResponse === false` (EC-CP-6). */
	isReadOnly(): boolean {
		return this.wrapper.find(this.byTid(TID.readonly)).exists();
	}

	rootText(): string {
		return this.root.text();
	}

	async keydown(key: string, modifiers: { shift?: boolean } = {}): Promise<KeyboardEvent> {
		const event = new KeyboardEvent('keydown', {
			key,
			shiftKey: modifiers.shift ?? false,
			cancelable: true,
		});
		this.root.element.dispatchEvent(event);
		await this.wrapper.vm.$nextTick();
		return event;
	}

	async clickOption(i: number): Promise<void> {
		await this.option(i).trigger('click');
	}
}
