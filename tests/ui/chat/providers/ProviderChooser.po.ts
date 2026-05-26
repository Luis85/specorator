import type { VueWrapper } from '@vue/test-utils';

const TID = {
	root: 'provider-chooser',
	option: 'provider-option',
	active: 'provider-option-active',
	icon: 'provider-icon',
} as const;

/** PageObject for `ProviderChooser.vue` (SPEC-PV-016). Queries by `data-testid` only (ADR-009). */
export class ProviderChooserPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	exists(): boolean {
		return this.wrapper.find(this.byTid(TID.root)).exists();
	}

	role(): string {
		return this.wrapper.get(this.byTid(TID.root)).attributes('role') ?? '';
	}

	accessibleName(): string {
		return this.wrapper.get(this.byTid(TID.root)).attributes('aria-label') ?? '';
	}

	optionCount(): number {
		return this.wrapper.findAll(this.byTid(TID.option)).length;
	}

	optionText(index: number): string {
		return this.wrapper.findAll(this.byTid(TID.option))[index].text();
	}

	activeMarkerCount(): number {
		return this.wrapper.findAll(this.byTid(TID.active)).length;
	}

	iconCount(): number {
		return this.wrapper.findAll(this.byTid(TID.icon)).length;
	}

	rootHtml(): string {
		return this.wrapper.get(this.byTid(TID.root)).html();
	}

	async clickOption(index: number): Promise<void> {
		await this.wrapper.findAll(this.byTid(TID.option))[index].trigger('click');
	}

	async pressOption(index: number, key: string): Promise<void> {
		await this.wrapper.findAll(this.byTid(TID.option))[index].trigger('keydown', { key });
	}
}
