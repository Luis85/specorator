import type { VueWrapper } from '@vue/test-utils';

export class ModelSelectorPO {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string) {
		return `[data-testid="${tid}"]`;
	}

	get root() {
		return this.wrapper.find(this.byTid('model-selector'));
	}

	get select() {
		return this.wrapper.find(this.byTid('model-selector-select'));
	}

	selectClasses(): string {
		const el = this.select.element as HTMLElement | undefined;
		return el?.getAttribute('class') ?? '';
	}

	options(): { value: string; label: string }[] {
		return this.wrapper.findAll('option').map((el) => ({
			value: (el.element as HTMLOptionElement).value,
			label: el.text(),
		}));
	}

	async pickValue(value: string): Promise<void> {
		await this.select.setValue(value);
	}
}
