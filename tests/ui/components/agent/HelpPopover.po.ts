/**
 * Page Object for `HelpPopover.vue` (WS-AUX-8b).
 *
 * Per ADR-009, Vue component tests query exclusively by `data-testid`.
 * Test IDs:
 *   `help-popover`, `help-search`, `help-list`, `help-item`, `help-announce`.
 */
import type { VueWrapper } from '@vue/test-utils'

export class HelpPopoverPO {
	constructor(public readonly wrapper: VueWrapper) {}

	get root() {
		return this.wrapper.find('[data-testid="help-popover"]')
	}

	get searchInput() {
		return this.wrapper.find('[data-testid="help-search"]')
	}

	get list() {
		return this.wrapper.find('[data-testid="help-list"]')
	}

	items() {
		return this.wrapper.findAll('[data-testid="help-item"]')
	}

	itemAt(i: number) {
		return this.items()[i]
	}

	get announce() {
		return this.wrapper.find('[data-testid="help-announce"]')
	}

	async typeQuery(text: string): Promise<void> {
		await this.searchInput.setValue(text)
	}

	async pressArrowDown(): Promise<void> {
		await this.searchInput.trigger('keydown', { key: 'ArrowDown' })
	}

	async pressArrowUp(): Promise<void> {
		await this.searchInput.trigger('keydown', { key: 'ArrowUp' })
	}

	async pressEnter(): Promise<void> {
		await this.searchInput.trigger('keydown', { key: 'Enter' })
	}

	async pressEscape(): Promise<void> {
		await this.searchInput.trigger('keydown', { key: 'Escape' })
	}

	activeIndex(): number {
		const items = this.items()
		for (let i = 0; i < items.length; i += 1) {
			if (items[i].attributes('data-active') === 'true') return i
		}
		return -1
	}
}
