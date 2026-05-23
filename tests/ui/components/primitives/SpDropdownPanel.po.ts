import type { VueWrapper } from '@vue/test-utils'

const TID = {
	panel: 'sp-dropdown-panel',
	backdrop: 'sp-dropdown-panel-backdrop',
} as const

/**
 * PageObject for `<SpDropdownPanel>`. Queries by `data-testid` only.
 * The panel teleports to body — queries traverse `document` once the
 * wrapper has been attached.
 */
export class SpDropdownPanelPageObject {
	constructor(_wrapper?: VueWrapper) {
		// The panel teleports to document.body, so all queries traverse the
		// global document. The wrapper is accepted for API symmetry with
		// other PageObjects but never read.
		void _wrapper
	}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`
	}

	panelEl(): HTMLElement | null {
		return document.querySelector<HTMLElement>(this.byTid(TID.panel))
	}

	backdropEl(): HTMLElement | null {
		return document.querySelector<HTMLElement>(this.byTid(TID.backdrop))
	}

	isOpen(): boolean {
		return this.panelEl() !== null
	}

	anchorMode(): string | null {
		return this.panelEl()?.getAttribute('data-anchor-mode') ?? null
	}

	ariaLabel(): string | null {
		return this.panelEl()?.getAttribute('aria-label') ?? null
	}

	role(): string | null {
		return this.panelEl()?.getAttribute('role') ?? null
	}

	pressEscape(): void {
		const panel = this.panelEl()
		if (!panel) return
		panel.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
		)
	}

	clickBackdrop(): void {
		this.backdropEl()?.click()
	}

	clickOutside(): void {
		document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
	}
}
