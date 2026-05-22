/**
 * Page Object for `FloatingNavSidebar.vue` (WS-AUX-9). ADR-009 — queries
 * exclusively by `data-testid`.
 */
import type { VueWrapper } from '@vue/test-utils'

export class FloatingNavSidebarPO {
	constructor(public readonly wrapper: VueWrapper) {}

	get root() {
		return this.wrapper.find('[data-testid="floating-nav-sidebar"]')
	}

	get scrollTopButton() {
		return this.wrapper.find('[data-testid="floating-nav-scroll-top"]')
	}

	get scrollBottomButton() {
		return this.wrapper.find('[data-testid="floating-nav-scroll-bottom"]')
	}

	get clearButton() {
		return this.wrapper.find('[data-testid="floating-nav-clear"]')
	}

	get toggleThinkingButton() {
		return this.wrapper.find('[data-testid="floating-nav-toggle-thinking"]')
	}

	exists(): boolean {
		return this.root.exists()
	}

	async clickScrollTop(): Promise<void> {
		await this.scrollTopButton.find('[data-testid="sp-icon-button"]').trigger('click')
	}

	async clickScrollBottom(): Promise<void> {
		await this.scrollBottomButton.find('[data-testid="sp-icon-button"]').trigger('click')
	}

	async clickClear(): Promise<void> {
		await this.clearButton.find('[data-testid="sp-icon-button"]').trigger('click')
	}

	async clickToggleThinking(): Promise<void> {
		await this.toggleThinkingButton.find('[data-testid="sp-icon-button"]').trigger('click')
	}
}
