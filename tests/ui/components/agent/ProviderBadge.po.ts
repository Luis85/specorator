import type { VueWrapper } from '@vue/test-utils';

const TID = {
	root: 'provider-badge',
	toggle: 'provider-badge-toggle',
	label: 'provider-badge-label',
} as const;

/**
 * PageObject for `<ProviderBadge>` (REQ-AUX-016, spec §1.6).
 * Queries by `data-testid` only.
 */
export class ProviderBadgePageObject {
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

	provider(): string | null {
		return this.root().getAttribute('data-provider');
	}

	labelText(): string {
		return this.wrapper.get(this.byTid(TID.label)).text();
	}
}
