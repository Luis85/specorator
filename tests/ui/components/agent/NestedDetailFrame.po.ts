import type { VueWrapper } from '@vue/test-utils';

const TID = {
	root: 'nested-detail-frame',
	summary: 'nested-detail-frame-summary',
	body: 'nested-detail-frame-body',
	icon: 'nested-detail-frame-icon',
	label: 'nested-detail-frame-label',
	summaryText: 'nested-detail-frame-summary-text',
} as const;

/**
 * PageObject for `<NestedDetailFrame>` (REQ-AUX-013, spec §1.3.7).
 * Queries by `data-testid` only.
 */
export class NestedDetailFramePageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	root(): HTMLElement {
		return this.wrapper.get(this.byTid(TID.root)).element as HTMLElement;
	}

	exists(): boolean {
		return this.wrapper.find(this.byTid(TID.root)).exists();
	}

	status(): string | null {
		return this.root().getAttribute('data-status');
	}

	label(): string {
		return this.wrapper.get(this.byTid(TID.label)).text();
	}

	summaryText(): string | null {
		const el = this.wrapper.find(this.byTid(TID.summaryText));
		return el.exists() ? el.text() : null;
	}

	bodyExists(): boolean {
		return this.wrapper.find(this.byTid(TID.body)).exists();
	}

	borderInlineStart(): string {
		return getComputedStyle(this.root()).borderInlineStart;
	}

	paddingInlineStart(): string {
		return getComputedStyle(this.root()).paddingInlineStart;
	}

	isOpen(): boolean {
		return (this.root() as HTMLDetailsElement).open === true;
	}

	async toggle(): Promise<void> {
		const summary = this.wrapper.get(this.byTid(TID.summary));
		await summary.trigger('click');
	}
}
