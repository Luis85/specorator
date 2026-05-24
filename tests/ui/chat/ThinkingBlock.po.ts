import type { VueWrapper } from '@vue/test-utils';

const TID = {
	root: 'thinking-block',
	label: 'thinking-label',
	collapsibleHeader: 'sp-collapsible-header',
} as const;

/** PageObject for `ThinkingBlock.vue` (SPEC-RR-027). Queries by `data-testid` only (ADR-009). */
export class ThinkingBlockPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	exists(): boolean {
		return this.wrapper.find(this.byTid(TID.root)).exists();
	}

	label(): string {
		return this.wrapper.get(this.byTid(TID.label)).text();
	}

	ariaExpanded(): string {
		return this.wrapper.get(this.byTid(TID.collapsibleHeader)).attributes('aria-expanded') ?? '';
	}

	async expand(): Promise<void> {
		await this.wrapper.get(this.byTid(TID.collapsibleHeader)).trigger('click');
	}
}
