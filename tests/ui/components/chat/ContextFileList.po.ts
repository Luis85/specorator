import type { VueWrapper } from '@vue/test-utils'

export class ContextFileListPO {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string) {
		return `[data-testid="${tid}"]`
	}

	get list() {
		return this.wrapper.find(this.byTid('context-file-list'))
	}

	get emptyState() {
		return this.wrapper.find(this.byTid('context-file-empty'))
	}

	get autoChips() {
		return this.wrapper.findAll(this.byTid('context-chip-auto'))
	}

	get manualChips() {
		return this.wrapper.findAll(this.byTid('context-chip-manual'))
	}

	get removeButtons() {
		return this.wrapper.findAll(this.byTid('context-chip-remove'))
	}

	hasEmptyState(): boolean {
		return this.emptyState.exists()
	}

	autoChipCount(): number {
		return this.autoChips.length
	}

	manualChipCount(): number {
		return this.manualChips.length
	}

	removeButtonCount(): number {
		return this.removeButtons.length
	}

	async clickFirstRemoveButton(): Promise<void> {
		await this.removeButtons[0].trigger('click')
	}

	emitted(name: string): unknown {
		return this.wrapper.emitted(name)
	}
}
