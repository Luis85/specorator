import type { VueWrapper } from '@vue/test-utils'

export class OnboardingPersonaCardPO {
	constructor(private readonly wrapper: VueWrapper) {}

	get button() { return this.wrapper.find('[data-testid="persona-card"]') }

	async click() { await this.button.trigger('click') }
}
