import type { VueWrapper } from '@vue/test-utils';

const TID = {
	root: 'toolbar-mcp',
	empty: 'toolbar-mcp-empty',
} as const;

/** PageObject for `McpSelector.vue` (SPEC-TC-018). Queries by `data-testid` only (ADR-009). */
export class McpSelectorPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	shellExists(): boolean {
		return this.wrapper.find(this.byTid(TID.root)).exists();
	}

	emptyExists(): boolean {
		return this.wrapper.find(this.byTid(TID.empty)).exists();
	}

	emptyText(): string {
		return this.wrapper.get(this.byTid(TID.empty)).text();
	}

	buttonText(): string {
		return this.wrapper.get(this.byTid(TID.root)).text();
	}

	async clickShell(): Promise<void> {
		await this.wrapper.get(this.byTid(TID.root)).trigger('click');
	}
}
