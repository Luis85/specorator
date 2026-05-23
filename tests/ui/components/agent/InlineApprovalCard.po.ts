/**
 * Page Object for `InlineApprovalCard.vue` (WS-AUX-8a).
 *
 * Per ADR-009, Vue component tests query exclusively by `data-testid`.
 * Test IDs:
 *   `inline-approval-card`, `inline-approval-title`,
 *   `inline-approval-actions`, `inline-approval-tab-{i}`,
 *   `inline-approval-item-{i}`,
 *   `inline-approval-deny`, `inline-approval-allow-once`,
 *   `inline-approval-allow-always`.
 */
import type { VueWrapper } from '@vue/test-utils'

export class InlineApprovalCardPO {
	constructor(public readonly wrapper: VueWrapper) {}

	get root() {
		return this.wrapper.find('[data-testid="inline-approval-card"]')
	}

	title() {
		return this.wrapper.find('[data-testid="inline-approval-title"]')
	}

	actionsRow() {
		return this.wrapper.find('[data-testid="inline-approval-actions"]')
	}

	tabAt(i: number) {
		return this.wrapper.find(`[data-testid="inline-approval-tab-${i}"]`)
	}

	itemAt(i: number) {
		return this.wrapper.find(`[data-testid="inline-approval-item-${i}"]`)
	}

	get denyButton() {
		return this.wrapper.find('[data-testid="inline-approval-deny"]')
	}

	get allowOnceButton() {
		return this.wrapper.find('[data-testid="inline-approval-allow-once"]')
	}

	get allowAlwaysButton() {
		return this.wrapper.find('[data-testid="inline-approval-allow-always"]')
	}

	async clickDeny(): Promise<void> {
		await this.denyButton.trigger('click')
	}

	async clickAllowOnce(): Promise<void> {
		await this.allowOnceButton.trigger('click')
	}

	async clickAllowAlways(): Promise<void> {
		await this.allowAlwaysButton.trigger('click')
	}
}
