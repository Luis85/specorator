import type { VueWrapper } from '@vue/test-utils';

const TID = { root: 'toolbar-service-tier' } as const;

/** PageObject for `ServiceTierToggle.vue` (SPEC-TC-017). Queries by `data-testid` only (ADR-009). */
export class ServiceTierTogglePageObject {
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

	checked(): string {
		return this.wrapper.get(this.byTid(TID.root)).attributes('aria-checked') ?? '';
	}

	ariaLabel(): string {
		return this.wrapper.get(this.byTid(TID.root)).attributes('aria-label') ?? '';
	}

	async click(): Promise<void> {
		await this.wrapper.get(this.byTid(TID.root)).trigger('click');
	}
}
