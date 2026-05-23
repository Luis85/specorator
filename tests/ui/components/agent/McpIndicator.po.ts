import type { VueWrapper } from '@vue/test-utils';

const TID = {
	root: 'mcp-indicator',
	count: 'mcp-indicator-count',
} as const;

/**
 * PageObject for `<McpIndicator>` (REQ-AUX-004).
 * Queries by `data-testid` only.
 */
export class McpIndicatorPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	exists(): boolean {
		return this.wrapper.find(this.byTid(TID.root)).exists();
	}

	root(): HTMLElement {
		return this.wrapper.get(this.byTid(TID.root)).element as HTMLElement;
	}

	isActive(): boolean {
		return this.root().getAttribute('data-active') === 'true';
	}

	countText(): string {
		const el = this.wrapper.find(this.byTid(TID.count));
		return el.exists() ? (el.element as HTMLElement).textContent.trim() : '';
	}

	tooltipText(): string {
		return this.root().getAttribute('title') ?? '';
	}
}
