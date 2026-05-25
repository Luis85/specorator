import type { VueWrapper } from '@vue/test-utils';

const TID = { root: 'toolbar-external' } as const;

/** PageObject for `ExternalContextControl.vue` (SPEC-TC-019). Queries by `data-testid` only (ADR-009). */
export class ExternalContextControlPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	exists(): boolean {
		return this.wrapper.find(this.byTid(TID.root)).exists();
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
