import type { VueWrapper } from '@vue/test-utils';

const TID = {
	dropdown: 'composer-dropdown',
	hints: 'composer-dropdown-hints',
	empty: 'composer-dropdown-empty',
} as const;

/** PageObject for `ComposerDropdown.vue` (SPEC-CP-020). Queries by `data-testid` only (ADR-009). */
export class ComposerDropdownPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	exists(): boolean {
		return this.wrapper.find(this.byTid(TID.dropdown)).exists();
	}

	get listbox() {
		return this.wrapper.get(this.byTid(TID.dropdown));
	}

	role(): string {
		return this.listbox.attributes('role') ?? '';
	}

	option(i: number) {
		return this.wrapper.get(this.byTid(`composer-dropdown-option-${i}`));
	}

	optionCount(): number {
		return this.wrapper.findAll('[data-testid^="composer-dropdown-option-"]').length;
	}

	optionText(i: number): string {
		return this.option(i).text();
	}

	optionSelected(i: number): boolean {
		return this.option(i).attributes('aria-selected') === 'true';
	}

	optionId(i: number): string {
		return this.option(i).attributes('id') ?? '';
	}

	/** The active-descendant id the listbox advertises (drives the textarea's aria-activedescendant). */
	activeDescendant(): string {
		return this.listbox.attributes('aria-activedescendant') ?? '';
	}

	hasEmptyState(): boolean {
		return this.wrapper.find(this.byTid(TID.empty)).exists();
	}

	emptyText(): string {
		return this.wrapper.get(this.byTid(TID.empty)).text();
	}

	hintsId(): string {
		return this.wrapper.get(this.byTid(TID.hints)).attributes('id') ?? '';
	}

	async clickOption(i: number): Promise<void> {
		await this.option(i).trigger('mousedown');
	}
}
