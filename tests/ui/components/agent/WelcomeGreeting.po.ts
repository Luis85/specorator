import type { VueWrapper } from '@vue/test-utils'

const TID = {
	root: 'welcome-greeting',
	title: 'welcome-greeting-title',
	subtitle: 'welcome-greeting-subtitle',
	suggestions: 'welcome-greeting-suggestions',
} as const

export class WelcomeGreetingPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`
	}

	get rootEl(): HTMLElement {
		return this.wrapper.get(this.byTid(TID.root)).element as HTMLElement
	}

	get titleEl(): HTMLElement {
		return this.wrapper.get(this.byTid(TID.title)).element as HTMLElement
	}

	get suggestionsEl(): HTMLElement {
		return this.wrapper.get(this.byTid(TID.suggestions)).element as HTMLElement
	}

	timeBand(): string | null {
		return this.rootEl.getAttribute('data-time-band')
	}

	titleText(): string {
		return this.titleEl.textContent.trim()
	}

	suggestionChipCount(): number {
		return this.suggestionsEl.querySelectorAll(
			'[data-testid^="welcome-suggestion-"]',
		).length
	}

	async clickSuggestion(id: string): Promise<void> {
		await this.wrapper.get(`[data-testid="welcome-suggestion-${id}"]`).trigger('click')
	}
}
