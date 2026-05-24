import type { VueWrapper } from '@vue/test-utils';

const TID = {
	root: 'sp-collapsible',
	header: 'sp-collapsible-header',
	body: 'sp-collapsible-body',
} as const;

/** PageObject for `SpCollapsible.vue` (SPEC-RR-024). Queries by `data-testid` only (ADR-009). */
export class SpCollapsiblePageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	exists(): boolean {
		return this.wrapper.find(this.byTid(TID.root)).exists();
	}

	get header() {
		return this.wrapper.get(this.byTid(TID.header));
	}

	bodyVisible(): boolean {
		return this.wrapper.find(this.byTid(TID.body)).exists();
	}

	ariaExpanded(): string {
		return this.header.attributes('aria-expanded') ?? '';
	}

	ariaLabel(): string {
		return this.header.attributes('aria-label') ?? '';
	}

	role(): string {
		return this.header.attributes('role') ?? '';
	}

	tabindex(): string {
		return this.header.attributes('tabindex') ?? '';
	}

	async clickHeader(): Promise<void> {
		await this.header.trigger('click');
	}

	async pressEnter(): Promise<KeyboardEvent> {
		const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
		this.header.element.dispatchEvent(event);
		await this.wrapper.vm.$nextTick();
		return event;
	}

	async pressSpace(): Promise<KeyboardEvent> {
		const event = new KeyboardEvent('keydown', { key: ' ', cancelable: true });
		this.header.element.dispatchEvent(event);
		await this.wrapper.vm.$nextTick();
		return event;
	}
}
