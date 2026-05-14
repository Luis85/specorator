import type { VueWrapper } from '@vue/test-utils'
export class OnboardingNudgePO {
	constructor(private readonly wrapper: VueWrapper) {}
	get nudge() { return this.wrapper.find('[data-testid="onboarding-nudge"]') }
	get action() { return this.wrapper.find('[data-testid="nudge-action"]') }
	get dismiss() { return this.wrapper.find('[data-testid="nudge-dismiss"]') }
	async clickAction() { await this.action.trigger('click') }
	async clickDismiss() { await this.dismiss.trigger('click') }
}
