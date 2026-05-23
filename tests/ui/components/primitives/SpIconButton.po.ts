import type { VueWrapper } from '@vue/test-utils'

const TID = {
	root: 'sp-icon-button',
	icon: 'sp-icon',
} as const

/**
 * PageObject for `<SpIconButton>`. Queries strictly by `data-testid`.
 */
export class SpIconButtonPageObject {
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

	ariaLabel(): string | null {
		return this.rootEl.getAttribute('aria-label')
	}

	isDisabled(): boolean {
		return this.rootEl.disabled
	}

	isLoading(): boolean {
		return this.rootEl.getAttribute('aria-busy') === 'true'
	}

	iconName(): string | null {
		const icon = this.rootEl.querySelector(this.byTid(TID.icon))
		return icon?.getAttribute('data-icon') ?? null
	}

	async click(): Promise<void> {
		await this.wrapper.get(this.byTid(TID.root)).trigger('click')
	}
}
