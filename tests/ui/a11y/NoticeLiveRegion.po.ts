import type { VueWrapper } from '@vue/test-utils';

const TID = { region: 'notice-live-region' } as const;

/**
 * PageObject for `NoticeLiveRegion.vue` (SPEC-AY-004). Queries by `data-testid`
 * only (ADR-009). Reads the live-region wiring (`aria-live` polite/assertive,
 * `role` status/alert) + the mirrored notice text.
 */
export class NoticeLiveRegionPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	exists(): boolean {
		return this.wrapper.find(this.byTid(TID.region)).exists();
	}

	ariaLive(): string {
		return this.wrapper.get(this.byTid(TID.region)).attributes('aria-live') ?? '';
	}

	role(): string {
		return this.wrapper.get(this.byTid(TID.region)).attributes('role') ?? '';
	}

	text(): string {
		return this.wrapper.get(this.byTid(TID.region)).text().trim();
	}

	/** The serialized region markup — for the no-`v-html` verbatim-text assertion. */
	html(): string {
		return this.wrapper.get(this.byTid(TID.region)).html();
	}
}
