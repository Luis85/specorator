import type { VueWrapper } from '@vue/test-utils'
export class OnboardingStep5DonePO {
	constructor(private readonly wrapper: VueWrapper) {}
	get heading() { return this.wrapper.find('[data-testid="step5-heading"]') }
	get body() { return this.wrapper.find('[data-testid="step5-body"]') }
	get summaryPersona() { return this.wrapper.find('[data-testid="step5-summary-persona"]') }
	get summaryClaude() { return this.wrapper.find('[data-testid="step5-summary-claude"]') }
	get summaryTemplates() { return this.wrapper.find('[data-testid="step5-summary-templates"]') }
	get cta() { return this.wrapper.find('[data-testid="step5-cta"]') }
	get saveError() { return this.wrapper.find('[data-testid="step5-save-error"]') }
	async clickCta() { await this.cta.trigger('click') }
}
