import type { VueWrapper } from '@vue/test-utils'

export class SettingsViewPO {
	constructor(private readonly wrapper: VueWrapper) {}

	get saveButton() {
		return this.wrapper.get('[data-testid="settings-save"]')
	}

	async clickSave(): Promise<void> {
		await this.saveButton.trigger('click')
	}
}
