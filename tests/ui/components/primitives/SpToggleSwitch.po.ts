import type { VueWrapper } from '@vue/test-utils'

const TID = {
	root: 'sp-toggle-switch',
	label: 'sp-toggle-switch-label',
} as const

/**
 * PageObject for `<SpToggleSwitch>`. Queries by `data-testid` only.
 */
export class SpToggleSwitchPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`
	}

	get rootEl(): HTMLButtonElement {
		return this.wrapper.get(this.byTid(TID.root)).element as HTMLButtonElement
	}

	ariaPressed(): string | null {
		return this.rootEl.getAttribute('aria-pressed')
	}

	ariaLabel(): string | null {
		return this.rootEl.getAttribute('aria-label')
	}

	labelText(): string {
		return this.wrapper.get(this.byTid(TID.label)).text()
	}

	isDisabled(): boolean {
		return this.rootEl.disabled
	}

	async click(): Promise<void> {
		await this.wrapper.get(this.byTid(TID.root)).trigger('click')
	}

	async pressKey(key: 'Enter' | ' '): Promise<void> {
		await this.wrapper.get(this.byTid(TID.root)).trigger('keydown', { key })
	}
}
