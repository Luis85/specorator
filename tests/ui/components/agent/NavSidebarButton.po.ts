/**
 * Page Object for `NavSidebarButton.vue` (WS-AUX-9). ADR-009 — queries by
 * `data-testid` only.
 */
import type { VueWrapper } from '@vue/test-utils'

export class NavSidebarButtonPO {
	constructor(public readonly wrapper: VueWrapper) {}

	get root() {
		return this.wrapper.find('[data-testid="nav-sidebar-button"]')
	}

	get button() {
		return this.wrapper.find('[data-testid="sp-icon-button"]')
	}

	async click(): Promise<void> {
		await this.button.trigger('click')
	}
}
