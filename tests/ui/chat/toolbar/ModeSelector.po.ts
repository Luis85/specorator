import type { VueWrapper } from '@vue/test-utils';

const TID = { root: 'toolbar-mode' } as const;

/** PageObject for `ModeSelector.vue` (SPEC-TC-014). Queries by `data-testid` only (ADR-009). */
export class ModeSelectorPageObject {
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

	text(): string {
		return this.wrapper.get(this.byTid(TID.root)).text();
	}

	async click(): Promise<void> {
		await this.wrapper.get(this.byTid(TID.root)).trigger('click');
	}
}
