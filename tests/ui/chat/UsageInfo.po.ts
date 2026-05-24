import type { VueWrapper } from '@vue/test-utils';

const TID = {
	root: 'usage-info',
	tokens: 'usage-tokens',
	percentage: 'usage-percentage',
	model: 'usage-model',
} as const;

/** PageObject for `UsageInfo.vue` (SPEC-RR-031). Queries by `data-testid` only (ADR-009). */
export class UsageInfoPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	exists(): boolean {
		return this.wrapper.find(this.byTid(TID.root)).exists();
	}

	text(): string {
		return this.wrapper.find(this.byTid(TID.root)).text();
	}

	tokensText(): string {
		return this.wrapper.get(this.byTid(TID.tokens)).text();
	}

	percentageExists(): boolean {
		return this.wrapper.find(this.byTid(TID.percentage)).exists();
	}

	percentageText(): string {
		return this.wrapper.get(this.byTid(TID.percentage)).text();
	}

	modelExists(): boolean {
		return this.wrapper.find(this.byTid(TID.model)).exists();
	}

	modelText(): string {
		return this.wrapper.get(this.byTid(TID.model)).text();
	}
}
