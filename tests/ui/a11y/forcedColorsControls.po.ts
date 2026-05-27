import type { VueWrapper } from '@vue/test-utils';

/**
 * Shared PageObject for the T-AY-006 forced-colors-control mount leg (TEST-AY-006).
 * Locates the RG-4-listed background-cue-only controls in a mounted surface by
 * `data-testid` only (ADR-009), then reads the role / class / `data-state` /
 * `aria-selected` attributes the RG-4 selectors key off. No CSS-class `find`
 * literal — every locator is a `data-testid` attribute selector.
 */
export class ForcedColorsControlsPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	exists(tid: string): boolean {
		return this.wrapper.find(this.byTid(tid)).exists();
	}

	role(tid: string): string {
		return this.wrapper.get(this.byTid(tid)).attributes('role') ?? '';
	}

	dataState(tid: string): string {
		return this.wrapper.get(this.byTid(tid)).attributes('data-state') ?? '';
	}

	classOf(tid: string): string {
		return this.wrapper.get(this.byTid(tid)).attributes('class') ?? '';
	}

	ariaSelectedAt(tid: string, index: number): string {
		return this.wrapper.findAll(this.byTid(tid))[index].attributes('aria-selected') ?? '';
	}

	roleAt(tid: string, index: number): string {
		return this.wrapper.findAll(this.byTid(tid))[index].attributes('role') ?? '';
	}

	count(tid: string): number {
		return this.wrapper.findAll(this.byTid(tid)).length;
	}
}
