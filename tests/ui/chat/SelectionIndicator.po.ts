import type { VueWrapper } from '@vue/test-utils';

const TID = {
	root: 'selection-indicator',
	label: 'selection-indicator-label',
	clear: 'selection-indicator-clear',
	browserCapture: 'selection-indicator-browser-capture',
} as const;

/** PageObject for `SelectionIndicator.vue` (SPEC-CA-021). Queries by `data-testid` only (ADR-009). */
export class SelectionIndicatorPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	rootExists(): boolean {
		return this.wrapper.find(this.byTid(TID.root)).exists();
	}

	labelExists(): boolean {
		return this.wrapper.find(this.byTid(TID.label)).exists();
	}

	labelText(): string {
		return this.wrapper.get(this.byTid(TID.label)).text();
	}

	clearExists(): boolean {
		return this.wrapper.find(this.byTid(TID.clear)).exists();
	}

	clearAriaLabel(): string {
		return this.wrapper.get(this.byTid(TID.clear)).attributes('aria-label') ?? '';
	}

	async clickClear(): Promise<void> {
		await this.wrapper.get(this.byTid(TID.clear)).trigger('click');
	}

	browserCaptureExists(): boolean {
		return this.wrapper.find(this.byTid(TID.browserCapture)).exists();
	}
}
