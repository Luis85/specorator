import type { DOMWrapper, VueWrapper } from '@vue/test-utils'
import { DOMWrapper as DOMWrapperCtor } from '@vue/test-utils'

/**
 * Page object for `<MentionDropdown>`. WS-AUX-8c routed the dropdown
 * through `<SpDropdownPanel>` (`<Teleport to="body">`), so element lookups
 * happen via `document` while the testid-only contract is preserved.
 */
export class MentionDropdownPO {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`
	}

	private findOne(selector: string): DOMWrapper<Element> {
		// `DOMWrapper` accepts a nullish element and exposes `.exists()` as
		// `false` in that case — matches the behaviour of `wrapper.find()`.
		return new DOMWrapperCtor(document.querySelector(selector))
	}

	private findAll(selector: string): DOMWrapper<Element>[] {
		return Array.from(document.querySelectorAll(selector)).map(
			(el) => new DOMWrapperCtor(el),
		)
	}

	dropdownExists(): boolean {
		return this.findOne(this.byTid('mention-dropdown')).exists()
	}

	hasRoleListbox(): boolean {
		const el = this.findOne(this.byTid('mention-dropdown'))
		return el.exists() && el.attributes('role') === 'listbox'
	}

	optionAt(index: number): DOMWrapper<Element> {
		return this.findOne(this.byTid(`mention-option-${index}`))
	}

	optionCount(): number {
		return this.findAll('[role="option"]').length
	}

	optionIsSelected(index: number): boolean {
		return this.optionAt(index).attributes('aria-selected') === 'true'
	}

	optionKind(index: number): string | undefined {
		return this.optionAt(index).attributes('data-kind')
	}

	optionLabel(index: number): string {
		return this.optionAt(index).text()
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
