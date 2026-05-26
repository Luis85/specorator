import type { VueWrapper } from '@vue/test-utils';

const TID = {
	root: 'approvals-panel',
	mode: 'approvals-mode',
	empty: 'approvals-empty',
	rule: 'approvals-rule',
	ruleRemove: 'approvals-rule-remove',
} as const;

/** PageObject for `ApprovalsPanel.vue` (SPEC-AS-013). Queries by `data-testid` only (ADR-009). */
export class ApprovalsPanelPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	exists(): boolean {
		return this.wrapper.find(this.byTid(TID.root)).exists();
	}

	modeText(): string {
		return this.wrapper.get(this.byTid(TID.mode)).text();
	}

	ruleCount(): number {
		return this.wrapper.findAll(this.byTid(TID.rule)).length;
	}

	emptyShown(): boolean {
		return this.wrapper.find(this.byTid(TID.empty)).exists();
	}

	async clickRemoveAt(index: number): Promise<void> {
		await this.wrapper.findAll(this.byTid(TID.ruleRemove))[index].trigger('click');
	}
}
