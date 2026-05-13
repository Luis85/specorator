import type { VueWrapper } from '@vue/test-utils'

export class OnboardingStep1WelcomePO {
	constructor(private readonly wrapper: VueWrapper) {}

	get container() { return this.wrapper.find('[data-testid="step1"]') }
	get heading() { return this.wrapper.find('h2') }
	get cta() { return this.wrapper.find('[data-testid="step1-cta"]') }

	async clickCta() { await this.cta.trigger('click') }
}
