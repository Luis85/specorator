import type { VueWrapper } from '@vue/test-utils'

const TID = {
	root: 'feature-card',
	progressFill: 'progress-fill',
	stepLabel: 'step-label',
	activate: 'activate-button',
	advanceStep: 'advance-step-button',
	open: 'open-button',
	archive: 'archive-button',
} as const

export class FeatureCardPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string) {
		return `[data-testid="${tid}"]`
	}

	get root() {
		return this.wrapper.get(this.byTid(TID.root))
	}

	get progressFill() {
		return this.wrapper.get(this.byTid(TID.progressFill))
	}

	get stepLabelText(): string {
		return this.wrapper.get(this.byTid(TID.stepLabel)).text()
	}

	hasStepLabel(): boolean {
		return this.wrapper.find(this.byTid(TID.stepLabel)).exists()
	}

	get advanceStepButton() {
		return this.wrapper.find(this.byTid(TID.advanceStep))
	}

	hasAdvanceStepButton(): boolean {
		return this.advanceStepButton.exists()
	}

	async clickAdvanceStep(): Promise<void> {
		await this.advanceStepButton.trigger('click')
	}

	emitted(name: string): unknown {
		return this.wrapper.emitted(name)
	}
}
