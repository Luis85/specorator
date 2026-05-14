import type { VueWrapper } from '@vue/test-utils'

export class OnboardingStep3ClaudeCheckPO {
	constructor(private readonly wrapper: VueWrapper) {}

	get container() { return this.wrapper.find('[data-testid="step3"]') }
	get statusRegion() { return this.wrapper.find('[data-testid="step3-status-region"]') }
	get statusMessage() { return this.wrapper.find('[data-testid="step3-status-message"]') }
	get continueBtn() { return this.wrapper.find('[data-testid="step3-continue"]') }

	async clickContinue() { await this.continueBtn.trigger('click') }
}
