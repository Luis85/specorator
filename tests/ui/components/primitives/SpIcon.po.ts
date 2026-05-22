import type { VueWrapper } from '@vue/test-utils'

const TID = {
	root: 'sp-icon',
} as const

/**
 * PageObject for `<SpIcon>`. Queries strictly by `data-testid` so component
 * markup details (class names, ids) can change without breaking tests.
 */
export class SpIconPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`
	}

	get iconEl(): HTMLElement {
		return this.wrapper.get(this.byTid(TID.root)).element as HTMLElement
	}

	iconName(): string | null {
		return this.iconEl.getAttribute('data-icon')
	}

	ariaLabel(): string | null {
		return this.iconEl.getAttribute('aria-label')
	}

	ariaHidden(): string | null {
		return this.iconEl.getAttribute('aria-hidden')
	}

	textContent(): string {
		return this.iconEl.textContent
	}

	hasSvgChild(): boolean {
		return this.iconEl.querySelector('svg') !== null
	}
}
