import type { VueWrapper } from '@vue/test-utils';

const TID = {
	root: 'mcp-settings',
	add: 'mcp-settings-add',
	paste: 'mcp-settings-paste',
	empty: 'mcp-settings-empty',
	row: 'mcp-server-row',
} as const;

/** PageObject for `McpSettingsManager.vue` (SPEC-MC-015). Queries by `data-testid` only (ADR-009). */
export class McpSettingsManagerPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	exists(): boolean {
		return this.wrapper.find(this.byTid(TID.root)).exists();
	}

	emptyShown(): boolean {
		return this.wrapper.find(this.byTid(TID.empty)).exists();
	}

	addExists(): boolean {
		return this.wrapper.find(this.byTid(TID.add)).exists();
	}

	pasteExists(): boolean {
		return this.wrapper.find(this.byTid(TID.paste)).exists();
	}

	rowCount(): number {
		return this.wrapper.findAll(this.byTid(TID.row)).length;
	}

	async clickAdd(): Promise<void> {
		await this.wrapper.get(this.byTid(TID.add)).trigger('click');
	}

	async clickPaste(): Promise<void> {
		await this.wrapper.get(this.byTid(TID.paste)).trigger('click');
	}
}
