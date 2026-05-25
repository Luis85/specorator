import type { VueWrapper } from '@vue/test-utils';

const TID = {
	indicator: 'plan-indicator',
} as const;

/** PageObject for `PlanModeIndicator.vue` (SPEC-CP-021). Queries by `data-testid` only (ADR-009). */
export class PlanModeIndicatorPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	exists(): boolean {
		return this.wrapper.find(this.byTid(TID.indicator)).exists();
	}

	get indicator() {
		return this.wrapper.get(this.byTid(TID.indicator));
	}

	/** The non-colour cue is the label text (NFR-CP-008). */
	label(): string {
		return this.indicator.text();
	}
}
