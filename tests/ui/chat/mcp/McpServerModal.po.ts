import type { VueWrapper } from '@vue/test-utils';

const TID = {
	root: 'mcp-server-modal',
	name: 'mcp-modal-name',
	config: 'mcp-modal-config',
	description: 'mcp-modal-description',
	contextSaving: 'mcp-modal-context-saving',
	nameError: 'mcp-modal-name-error',
	parseError: 'mcp-modal-parse-error',
	save: 'mcp-modal-save',
	cancel: 'mcp-modal-cancel',
} as const;

/** PageObject for `McpServerModal.vue` (SPEC-MC-016). Queries by `data-testid` only (ADR-009). */
export class McpServerModalPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	exists(): boolean {
		return this.wrapper.find(this.byTid(TID.root)).exists();
	}

	nameValue(): string {
		return (this.wrapper.get(this.byTid(TID.name)).element as HTMLInputElement).value;
	}

	configValue(): string {
		return (this.wrapper.get(this.byTid(TID.config)).element as HTMLTextAreaElement).value;
	}

	descriptionValue(): string {
		return (this.wrapper.get(this.byTid(TID.description)).element as HTMLInputElement).value;
	}

	contextSavingChecked(): boolean {
		return (this.wrapper.get(this.byTid(TID.contextSaving)).element as HTMLInputElement).checked;
	}

	nameErrorShown(): boolean {
		return this.wrapper.find(this.byTid(TID.nameError)).exists();
	}

	nameErrorText(): string {
		return this.wrapper.get(this.byTid(TID.nameError)).text();
	}

	parseErrorShown(): boolean {
		return this.wrapper.find(this.byTid(TID.parseError)).exists();
	}

	parseErrorText(): string {
		return this.wrapper.get(this.byTid(TID.parseError)).text();
	}

	nameFocused(): boolean {
		return document.activeElement === this.wrapper.get(this.byTid(TID.name)).element;
	}

	async setName(value: string): Promise<void> {
		await this.wrapper.get(this.byTid(TID.name)).setValue(value);
	}

	async setConfig(value: string): Promise<void> {
		await this.wrapper.get(this.byTid(TID.config)).setValue(value);
	}

	async setDescription(value: string): Promise<void> {
		await this.wrapper.get(this.byTid(TID.description)).setValue(value);
	}

	async clickSave(): Promise<void> {
		await this.wrapper.get(this.byTid(TID.save)).trigger('click');
	}

	async clickCancel(): Promise<void> {
		await this.wrapper.get(this.byTid(TID.cancel)).trigger('click');
	}

	async pressEscape(): Promise<void> {
		await this.wrapper.get(this.byTid(TID.root)).trigger('keydown', { key: 'Escape' });
	}
}
