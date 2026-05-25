import type { VueWrapper } from '@vue/test-utils';

const TID = {
	root: 'inline-exit-plan',
	plan: 'inline-exit-plan-preview',
	implement: 'inline-exit-plan-implement',
	revise: 'inline-exit-plan-revise',
	cancel: 'inline-exit-plan-cancel',
	feedback: 'inline-exit-plan-feedback',
	readonly: 'inline-exit-plan-readonly',
} as const;

/** PageObject for `InlineExitPlanMode.vue` (SPEC-CP-023). Queries by `data-testid` only (ADR-009). */
export class InlineExitPlanModePageObject {
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

	planText(): string {
		return this.wrapper.get(this.byTid(TID.plan)).text();
	}

	hasImplement(): boolean {
		return this.wrapper.find(this.byTid(TID.implement)).exists();
	}

	hasRevise(): boolean {
		return this.wrapper.find(this.byTid(TID.revise)).exists();
	}

	hasCancel(): boolean {
		return this.wrapper.find(this.byTid(TID.cancel)).exists();
	}

	hasFeedbackInput(): boolean {
		return this.wrapper.find(this.byTid(TID.feedback)).exists();
	}

	get feedbackInput() {
		return this.wrapper.get(this.byTid(TID.feedback));
	}

	isReadOnly(): boolean {
		return this.wrapper.find(this.byTid(TID.readonly)).exists();
	}

	async clickImplement(): Promise<void> {
		await this.wrapper.get(this.byTid(TID.implement)).trigger('click');
	}

	async clickRevise(): Promise<void> {
		await this.wrapper.get(this.byTid(TID.revise)).trigger('click');
	}

	async clickCancel(): Promise<void> {
		await this.wrapper.get(this.byTid(TID.cancel)).trigger('click');
	}

	async pressEscape(): Promise<KeyboardEvent> {
		const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
		this.root.element.dispatchEvent(event);
		await this.wrapper.vm.$nextTick();
		return event;
	}
}
