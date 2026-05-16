import type { VueWrapper } from '@vue/test-utils'

export class MentionDropdownPO {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string) {
		return `[data-testid="${tid}"]`
	}

	dropdownExists(): boolean {
		return this.wrapper.find(this.byTid('mention-dropdown')).exists()
	}

	hasRoleListbox(): boolean {
		const el = this.wrapper.find(this.byTid('mention-dropdown'))
		return el.exists() && el.attributes('role') === 'listbox'
	}

	optionAt(index: number) {
		return this.wrapper.find(this.byTid(`mention-option-${index}`))
	}

	optionCount(): number {
		return this.wrapper.findAll('[role="option"]').length
	}

	optionIsSelected(index: number): boolean {
		return this.optionAt(index).attributes('aria-selected') === 'true'
	}

	async clickOption(index: number): Promise<void> {
		await this.optionAt(index).trigger('mousedown')
	}

	async hoverOption(index: number): Promise<void> {
		await this.optionAt(index).trigger('mouseenter')
	}

	emitted(name: string): unknown {
		return this.wrapper.emitted(name)
	}
}
