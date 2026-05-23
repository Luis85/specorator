import type { VueWrapper } from '@vue/test-utils'

export class WelcomeSuggestionChipPageObject {
	constructor(
		private readonly wrapper: VueWrapper,
		private readonly id: string,
	) {}

	get rootEl(): HTMLElement {
		return this.wrapper.get(`[data-testid="welcome-suggestion-${this.id}"]`)
			.element as HTMLElement
	}

	labelText(): string {
		return this.rootEl.textContent.trim()
	}

	ariaLabel(): string | null {
		return this.rootEl.getAttribute('aria-label')
	}

	async click(): Promise<void> {
		await this.wrapper
			.get(`[data-testid="welcome-suggestion-${this.id}"]`)
			.trigger('click')
	}
}
