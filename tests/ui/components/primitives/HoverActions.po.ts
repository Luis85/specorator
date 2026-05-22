import type { VueWrapper } from '@vue/test-utils'

const TID = {
	root: 'hover-actions',
} as const

/**
 * PageObject for `<HoverActions>`. Queries by `data-testid` only.
 */
export class HoverActionsPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`
	}

	get actionsContainer(): HTMLElement {
		return this.wrapper.get(this.byTid(TID.root)).element as HTMLElement
	}

	role(): string | null {
		return this.actionsContainer.getAttribute('role')
	}

	placement(): string | null {
		return this.actionsContainer.getAttribute('data-placement')
	}

	alwaysVisible(): string | null {
		return this.actionsContainer.getAttribute('data-always-visible')
	}

	isVisible(): boolean {
		const opacity = getComputedStyle(this.actionsContainer).opacity
		return Number(opacity) > 0
	}

	transitionDuration(): string {
		return getComputedStyle(this.actionsContainer).transitionDuration
	}

	opacityValue(): string {
		return getComputedStyle(this.actionsContainer).opacity
	}

	displayValue(): string {
		return getComputedStyle(this.actionsContainer).display
	}

	visibilityValue(): string {
		return getComputedStyle(this.actionsContainer).visibility
	}

	slottedChildren(): HTMLElement[] {
		return Array.from(this.actionsContainer.children) as HTMLElement[]
	}

	slottedCount(): number {
		return this.slottedChildren().length
	}
}
