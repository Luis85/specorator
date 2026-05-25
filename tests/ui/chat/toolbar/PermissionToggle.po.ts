import type { VueWrapper } from '@vue/test-utils';

const TID = {
	root: 'toolbar-permission',
	plan: 'toolbar-permission-plan',
} as const;

/** PageObject for `PermissionToggle.vue` (SPEC-TC-015). Queries by `data-testid` only (ADR-009). */
export class PermissionTogglePageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	toggleExists(): boolean {
		return this.wrapper.find(this.byTid(TID.root)).exists();
	}

	planExists(): boolean {
		return this.wrapper.find(this.byTid(TID.plan)).exists();
	}

	planText(): string {
		return this.wrapper.get(this.byTid(TID.plan)).text();
	}

	role(): string {
		return this.wrapper.get(this.byTid(TID.root)).attributes('role') ?? '';
	}

	ariaDisabled(): string {
		return this.wrapper.get(this.byTid(TID.root)).attributes('aria-disabled') ?? '';
	}

	ariaLabel(): string {
		return this.wrapper.get(this.byTid(TID.root)).attributes('aria-label') ?? '';
	}

	async click(): Promise<void> {
		await this.wrapper.get(this.byTid(TID.root)).trigger('click');
	}
}
