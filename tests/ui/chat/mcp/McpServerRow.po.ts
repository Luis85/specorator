import type { VueWrapper } from '@vue/test-utils';

const TID = {
	root: 'mcp-server-row',
	name: 'mcp-server-name',
	type: 'mcp-server-type',
	enabled: 'mcp-server-enabled',
	edit: 'mcp-server-edit',
	remove: 'mcp-server-remove',
	test: 'mcp-server-test',
} as const;

/** PageObject for `McpServerRow.vue` (SPEC-MC-015). Queries by `data-testid` only (ADR-009). */
export class McpServerRowPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	exists(): boolean {
		return this.wrapper.find(this.byTid(TID.root)).exists();
	}

	nameText(): string {
		return this.wrapper.get(this.byTid(TID.name)).text();
	}

	typeText(): string {
		return this.wrapper.get(this.byTid(TID.type)).text();
	}

	enabledChecked(): boolean {
		const el = this.wrapper.get(this.byTid(TID.enabled)).element as HTMLInputElement;
		return el.checked;
	}

	enabledAriaLabel(): string {
		return this.wrapper.get(this.byTid(TID.enabled)).attributes('aria-label') ?? '';
	}

	editAriaLabel(): string {
		return this.wrapper.get(this.byTid(TID.edit)).attributes('aria-label') ?? '';
	}

	removeAriaLabel(): string {
		return this.wrapper.get(this.byTid(TID.remove)).attributes('aria-label') ?? '';
	}

	testAriaLabel(): string {
		return this.wrapper.get(this.byTid(TID.test)).attributes('aria-label') ?? '';
	}

	async toggleEnabled(): Promise<void> {
		const el = this.wrapper.get(this.byTid(TID.enabled));
		(el.element as HTMLInputElement).checked = !(el.element as HTMLInputElement).checked;
		await el.trigger('change');
	}

	async clickEdit(): Promise<void> {
		await this.wrapper.get(this.byTid(TID.edit)).trigger('click');
	}

	async clickRemove(): Promise<void> {
		await this.wrapper.get(this.byTid(TID.remove)).trigger('click');
	}

	async clickTest(): Promise<void> {
		await this.wrapper.get(this.byTid(TID.test)).trigger('click');
	}
}
