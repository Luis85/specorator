import type { VueWrapper } from '@vue/test-utils';

const TID = {
	root: 'inline-plan-approval',
	context: 'inline-plan-approval-context',
	option: 'inline-plan-approval-option',
	readonly: 'inline-plan-approval-readonly',
} as const;

/** PageObject for `InlinePlanApproval.vue` (SPEC-CP-024). Queries by `data-testid` only (ADR-009). */
export class InlinePlanApprovalPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	exists(): boolean {
		return this.wrapper.find(this.byTid(TID.root)).exists();
	}

	get root() {
		return this.wrapper.get(this.byTid(TID.root));
	}

	contextText(): string {
		return this.wrapper.get(this.byTid(TID.context)).text();
	}

	optionCount(): number {
		return this.wrapper.findAll(`[data-testid^="${TID.option}-"]`).length;
	}

	/** Find the option button carrying the given decision value. */
	optionFor(decision: string) {
		return this.wrapper.get(this.byTid(`${TID.option}-${decision}`));
	}

	hasOptionFor(decision: string): boolean {
		return this.wrapper.find(this.byTid(`${TID.option}-${decision}`)).exists();
	}

	async clickOptionFor(decision: string): Promise<void> {
		await this.optionFor(decision).trigger('click');
	}

	isReadOnly(): boolean {
		return this.wrapper.find(this.byTid(TID.readonly)).exists();
	}

	async pressEscape(): Promise<void> {
		this.root.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
		await this.wrapper.vm.$nextTick();
	}
}
