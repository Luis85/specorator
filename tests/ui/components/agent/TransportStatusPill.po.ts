import type { VueWrapper } from '@vue/test-utils';

const TID = {
	root: 'transport-status-pill',
	text: 'transport-status-pill-text',
	retry: 'transport-status-pill-retry',
} as const;

/**
 * PageObject for `<TransportStatusPill>` (REQ-AUX-016).
 * Queries by `data-testid` only.
 */
export class TransportStatusPillPageObject {
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

	kind(): string {
		return this.root().getAttribute('data-kind') ?? '';
	}

	text(): string {
		const el = this.wrapper.find(this.byTid(TID.text));
		if (!el.exists()) return '';
		return (el.element as HTMLElement).textContent.trim();
	}

	hasRetry(): boolean {
		return this.wrapper.find(this.byTid(TID.retry)).exists();
	}

	async clickRetry(): Promise<void> {
		await this.wrapper.find(this.byTid(TID.retry)).trigger('click');
	}
}
