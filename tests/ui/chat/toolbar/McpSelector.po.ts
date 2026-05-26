import type { VueWrapper } from '@vue/test-utils';

const TID = {
	root: 'toolbar-mcp',
	empty: 'toolbar-mcp-empty',
	badge: 'mcp-selector-badge',
	server: 'mcp-selector-server',
	toggle: 'mcp-selector-toggle',
} as const;

/** PageObject for `McpSelector.vue` (SPEC-MC-018, extends SPEC-TC-018). Queries by `data-testid` only (ADR-009). */
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

	badgeText(): string {
		return this.wrapper.get(this.byTid(TID.badge)).text();
	}

	ariaExpanded(): string {
		return this.wrapper.get(this.byTid(TID.root)).attributes('aria-expanded') ?? '';
	}

	serverCount(): number {
		return this.wrapper.findAll(this.byTid(TID.server)).length;
	}

	async clickShell(): Promise<void> {
		await this.wrapper.get(this.byTid(TID.root)).trigger('click');
	}

	async toggleServerAt(index: number): Promise<void> {
		const toggle = this.wrapper.findAll(this.byTid(TID.toggle))[index];
		(toggle.element as HTMLInputElement).checked = !(toggle.element as HTMLInputElement).checked;
		await toggle.trigger('change');
	}
}
