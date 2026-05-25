import type { VueWrapper } from '@vue/test-utils';

const TID = {
	root: 'approvals-rule',
	remove: 'approvals-rule-remove',
} as const;

/** PageObject for `ApprovalRuleRow.vue` (SPEC-AS-014). Queries by `data-testid` only (ADR-009). */
export class ApprovalRuleRowPageObject {
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

	hasRemove(): boolean {
		return this.wrapper.find(this.byTid(TID.remove)).exists();
	}

	removeAriaLabel(): string {
		return this.wrapper.get(this.byTid(TID.remove)).attributes('aria-label') ?? '';
	}

	async clickRemove(): Promise<void> {
		await this.wrapper.get(this.byTid(TID.remove)).trigger('click');
	}
}
