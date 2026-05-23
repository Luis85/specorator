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
		// QW-D — the chip's inner label span also carries a
		// `welcome-suggestion-<id>-label` testid. Restrict to the chip
		// elements (buttons) so the label spans don't double-count.
		return this.suggestionsEl.querySelectorAll(
			'[data-testid^="welcome-suggestion-"]:not([data-testid$="-label"])',
		).length
	}

	async clickSuggestion(id: string): Promise<void> {
		await this.wrapper.get(`[data-testid="welcome-suggestion-${id}"]`).trigger('click')
	}

	suggestionLabel(id: string): string {
		// QW-D — chip renders `<SpIcon>` + a separate label span; we read the
		// label span via its own `welcome-suggestion-<id>-label` testid so the
		// icon's embedded `<title>` (added by MockBridge to mimic Lucide
		// markup) does not leak into the asserted string.
		const labelEl = this.wrapper.get(
			`[data-testid="welcome-suggestion-${id}-label"]`,
		).element as HTMLElement
		return labelEl.textContent.trim()
	}
}
