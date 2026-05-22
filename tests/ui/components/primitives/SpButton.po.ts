import type { VueWrapper } from '@vue/test-utils'

const TID = {
	root: 'sp-button',
} as const

/**
 * PageObject for `<SpButton>`. Queries by `data-testid` only.
 */
export class SpButtonPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`
	}

	get rootEl(): HTMLButtonElement {
		return this.wrapper.get(this.byTid(TID.root)).element as HTMLButtonElement
	}

	variant(): string | null {
		return this.rootEl.getAttribute('data-variant')
	}

	isDisabled(): boolean {
		return this.rootEl.disabled
	}

	isLoading(): boolean {
		return this.rootEl.getAttribute('aria-busy') === 'true'
	}

	type(): string | null {
		return this.rootEl.getAttribute('type')
	}

	textContent(): string {
		return this.rootEl.textContent
	}

	async click(): Promise<void> {
		await this.wrapper.get(this.byTid(TID.root)).trigger('click')
	}
}
