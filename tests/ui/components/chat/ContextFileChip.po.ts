import type { VueWrapper } from '@vue/test-utils'

export class ContextFileChipPO {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string) {
		return `[data-testid="${tid}"]`
	}

	get autoChip() {
		return this.wrapper.find(this.byTid('context-chip-auto'))
	}

	get manualChip() {
		return this.wrapper.find(this.byTid('context-chip-manual'))
	}

	get removeButton() {
		return this.wrapper.find(this.byTid('context-chip-remove'))
	}

	hasAutoChip(): boolean {
		return this.autoChip.exists()
	}

	hasManualChip(): boolean {
		return this.manualChip.exists()
	}

	hasRemoveButton(): boolean {
		return this.removeButton.exists()
	}

	async clickRemove(): Promise<void> {
		await this.removeButton.trigger('click')
	}

	async keydownRemove(key: string): Promise<void> {
		await this.removeButton.trigger('keydown', { key })
	}

	emitted(name: string): unknown {
		return this.wrapper.emitted(name)
	}

	text(): string {
		return this.wrapper.text()
	}
}
