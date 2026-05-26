import type { VueWrapper } from '@vue/test-utils';

const TID = {
	root: 'provider-option',
	active: 'provider-option-active',
	icon: 'provider-icon',
} as const;

/** PageObject for `ProviderOption.vue` (SPEC-PV-016). Queries by `data-testid` only (ADR-009). */
export class ProviderOptionPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	exists(): boolean {
		return this.wrapper.find(this.byTid(TID.root)).exists();
	}

	text(): string {
		return this.wrapper.get(this.byTid(TID.root)).text();
	}

	role(): string {
		return this.wrapper.get(this.byTid(TID.root)).attributes('role') ?? '';
	}

	ariaCurrent(): string {
		return this.wrapper.get(this.byTid(TID.root)).attributes('aria-current') ?? '';
	}

	accessibleName(): string {
		return this.wrapper.get(this.byTid(TID.root)).attributes('aria-label') ?? '';
	}

	/** The active marker is rendered when the option is the active provider. */
	activeMarkerShown(): boolean {
		return this.wrapper.find(this.byTid(TID.active)).exists();
	}

	iconExists(): boolean {
		return this.wrapper.find(this.byTid(TID.icon)).exists();
	}

	iconLabel(): string {
		return this.wrapper.get(this.byTid(TID.icon)).attributes('aria-label') ?? '';
	}

	html(): string {
		return this.wrapper.get(this.byTid(TID.root)).html();
	}

	async click(): Promise<void> {
		await this.wrapper.get(this.byTid(TID.root)).trigger('click');
	}

	async press(key: string): Promise<void> {
		await this.wrapper.get(this.byTid(TID.root)).trigger('keydown', { key });
	}
}
