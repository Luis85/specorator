import type { VueWrapper } from '@vue/test-utils';

const TID = {
	root: 'compact-boundary',
	label: 'compact-boundary-label',
	icon: 'compact-boundary-icon',
} as const;

/**
 * PageObject for `<CompactBoundary>` (spec §1.4).
 */
export class CompactBoundaryPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	exists(): boolean {
		return this.wrapper.find(this.byTid(TID.root)).exists();
	}

	root(): HTMLElement {
		return this.wrapper.get(this.byTid(TID.root)).element as HTMLElement;
	}

	label(): string {
		return this.wrapper.get(this.byTid(TID.label)).text();
	}

	iconExists(): boolean {
		return this.wrapper.find(this.byTid(TID.icon)).exists();
	}
}
