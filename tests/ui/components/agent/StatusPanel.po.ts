import type { VueWrapper } from '@vue/test-utils';

export class StatusPanelPO {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string) {
		return `[data-testid="${tid}"]`;
	}

	get root() {
		return this.wrapper.find(this.byTid('status-panel'));
	}

	get header() {
		return this.wrapper.find(this.byTid('status-panel-header'));
	}

	get body() {
		return this.wrapper.find(this.byTid('status-panel-body'));
	}

	headerAriaExpanded(): string | undefined {
		return this.header.attributes('aria-expanded');
	}

	async clickHeader(): Promise<void> {
		await this.header.trigger('click');
	}
}
