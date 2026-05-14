import type { VueWrapper } from '@vue/test-utils'

export class OnboardingStep2PersonaPO {
	constructor(private readonly wrapper: VueWrapper) {}

	get container() { return this.wrapper.find('[data-testid="step2"]') }
	get textarea() { return this.wrapper.find('[data-testid="step2-textarea"]') }
	get continueBtn() { return this.wrapper.find('[data-testid="step2-continue"]') }
	get skipBtn() { return this.wrapper.find('[data-testid="step2-skip"]') }
	get saveError() { return this.wrapper.find('[data-testid="step2-save-error"]') }
	cards() { return this.wrapper.findAll('[data-testid^="step2-card"]') }

	async typePersona(text: string) {
		await this.textarea.setValue(text)
	}
	async clickContinue() { await this.continueBtn.trigger('click') }
	async clickSkip() { await this.skipBtn.trigger('click') }
}
