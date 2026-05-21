/**
 * Page Object for `ApprovalCard.vue` (WS-9, T-MPS-135/136).
 *
 * Per ADR-009, Vue component tests query exclusively by `data-testid`.
 * Test IDs per SPEC-MPS-001 §8.4:
 *   `approval-card`, `approval-action-deny`,
 *   `approval-action-allow-once`, `approval-action-always-allow`.
 */
import type { VueWrapper } from '@vue/test-utils'

export class ApprovalCardPO {
	constructor(public readonly wrapper: VueWrapper) {}

	get root() {
		return this.wrapper.find('[data-testid="approval-card"]')
	}

	get denyButton() {
		return this.wrapper.find('[data-testid="approval-action-deny"]')
	}

	get allowOnceButton() {
		return this.wrapper.find('[data-testid="approval-action-allow-once"]')
	}

	get alwaysAllowButton() {
		return this.wrapper.find('[data-testid="approval-action-always-allow"]')
	}

	get previewBlock() {
		return this.wrapper.find('[data-testid="approval-card-preview"]')
	}

	async clickDeny(): Promise<void> {
		await this.denyButton.trigger('click')
	}

	async clickAllowOnce(): Promise<void> {
		await this.allowOnceButton.trigger('click')
	}

	async clickAlwaysAllow(): Promise<void> {
		await this.alwaysAllowButton.trigger('click')
	}
}
