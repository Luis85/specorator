import type { VueWrapper } from '@vue/test-utils';

const TID = {
	root: 'toolbar-usage',
	arc: 'toolbar-usage-arc',
	label: 'toolbar-usage-label',
} as const;

/** PageObject for `UsageMeter.vue` (SPEC-TC-020). Queries by `data-testid` only (ADR-009). */
export class UsageMeterPageObject {
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

	ariaLabel(): string {
		return this.wrapper.get(this.byTid(TID.root)).attributes('aria-label') ?? '';
	}

	title(): string {
		return this.wrapper.get(this.byTid(TID.root)).attributes('title') ?? '';
	}

	isWarning(): boolean {
		return this.wrapper.get(this.byTid(TID.root)).classes().some((c) => c.includes('--warning'));
	}

	arcExists(): boolean {
		return this.wrapper.find(this.byTid(TID.arc)).exists();
	}

	/** The arc fill `<path>`'s `stroke-dasharray` attribute (driven by the percentage). */
	arcDashArray(): string {
		return this.wrapper.get(this.byTid(TID.arc)).attributes('stroke-dasharray') ?? '';
	}

	labelText(): string {
		return this.wrapper.get(this.byTid(TID.label)).text();
	}
}
