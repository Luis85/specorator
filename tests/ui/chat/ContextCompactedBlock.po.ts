import type { VueWrapper } from '@vue/test-utils';

const TID = {
	root: 'context-compacted',
} as const;

/** PageObject for `ContextCompactedBlock.vue` (SPEC-RR-032). Queries by `data-testid` only (ADR-009). */
export class ContextCompactedBlockPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	exists(): boolean {
		return this.wrapper.find(this.byTid(TID.root)).exists();
	}

	text(): string {
		return this.wrapper.get(this.byTid(TID.root)).text();
	}
}
