import type { VueWrapper } from '@vue/test-utils';

/** PageObject for `ResumeSessionDropdown.vue` (SPEC-TS-022). data-testid only (ADR-009). */
export class ResumeSessionDropdownPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	hasOpener(): boolean {
		return this.wrapper.find('[data-testid="history-open"]').exists();
	}

	async open(): Promise<void> {
		await this.wrapper.get('[data-testid="history-open"]').trigger('click');
	}

	isListOpen(): boolean {
		return this.wrapper.find('[data-testid="history-list"]').exists();
	}

	listRole(): string | undefined {
		return this.wrapper.get('[data-testid="history-list"]').attributes('role');
	}

	activeDescendant(): string | undefined {
		return this.wrapper.get('[data-testid="history-list"]').attributes('aria-activedescendant');
	}

	rows() {
		return this.wrapper.findAll('[data-testid="history-row"]');
	}

	rowCount(): number {
		return this.rows().length;
	}

	rowText(index: number): string {
		return this.rows()[index].text();
	}

	rowRole(index: number): string | undefined {
		return this.rows()[index].attributes('role');
	}

	rowSelected(index: number): string | undefined {
		return this.rows()[index].attributes('aria-selected');
	}

	isEmptyShown(): boolean {
		return this.wrapper.find('[data-testid="history-empty"]').exists();
	}

	hasSpinner(): boolean {
		return this.wrapper.find('[data-testid="history-spinner"]').exists();
	}

	async clickRow(index: number): Promise<void> {
		await this.rows()[index].trigger('click');
	}

	async clickDelete(index: number): Promise<void> {
		const deletes = this.wrapper.findAll('[data-testid="history-delete"]');
		await deletes[index].trigger('click');
	}

	async clickRename(index: number): Promise<void> {
		const renames = this.wrapper.findAll('[data-testid="history-rename"]');
		await renames[index].trigger('click');
	}

	hasRenameInput(): boolean {
		return this.wrapper.find('[data-testid="history-rename-input"]').exists();
	}

	async typeRename(value: string): Promise<void> {
		const input = this.wrapper.get('[data-testid="history-rename-input"]');
		await input.setValue(value);
		await input.trigger('keydown', { key: 'Enter' });
	}

	async keydownList(key: string): Promise<void> {
		await this.wrapper.get('[data-testid="history-list"]').trigger('keydown', { key });
	}

	openerIsFocused(): boolean {
		const opener = this.wrapper.get('[data-testid="history-open"]').element;
		return document.activeElement === opener;
	}

	/** R-TS-007: every glyph renders via `SpIcon` (a `data-testid="sp-icon"` span). */
	spIconCount(): number {
		return this.wrapper.findAll('[data-testid="sp-icon"]').length;
	}

	/** R-TS-007: the full rendered markup — used to assert no emoji/raw-glyph literals. */
	html(): string {
		return this.wrapper.html();
	}
}
