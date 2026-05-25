import type { VueWrapper } from '@vue/test-utils';

const TID = {
	root: 'toolbar-thinking',
	option: 'toolbar-thinking-option',
} as const;

/** PageObject for `ThinkingSelector.vue` (SPEC-TC-016). Queries by `data-testid` only (ADR-009). */
export class ThinkingSelectorPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	buttonExists(): boolean {
		return this.wrapper.find(this.byTid(TID.root)).exists();
	}

	buttonText(): string {
		return this.wrapper.get(this.byTid(TID.root)).text();
	}

	buttonRole(): string {
		return this.wrapper.get(this.byTid(TID.root)).attributes('role') ?? '';
	}

	expanded(): string {
		return this.wrapper.get(this.byTid(TID.root)).attributes('aria-expanded') ?? '';
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

	activeDescendant(): string {
		return this.wrapper.get('[role="listbox"]').attributes('aria-activedescendant') ?? '';
	}

	optionId(index: number): string {
		return this.wrapper.findAll(this.byTid(TID.option))[index].attributes('id') ?? '';
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
}
