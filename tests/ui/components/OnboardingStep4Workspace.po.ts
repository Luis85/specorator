import type { VueWrapper } from '@vue/test-utils'

export class OnboardingStep4WorkspacePO {
	constructor(private readonly wrapper: VueWrapper) {}

	get container() { return this.wrapper.find('[data-testid="step4"]') }
	get folderInput() { return this.wrapper.find('[data-testid="step4-specs-folder-input"]') }
	get fieldHint() { return this.wrapper.find('[data-testid="step4-field-hint"]') }
	get statusParagraph() { return this.wrapper.find('[data-testid="step4-status-paragraph"]') }
	get installBtn() { return this.wrapper.find('[data-testid="step4-install-btn"]') }
	get skipBtn() { return this.wrapper.find('[data-testid="step4-skip-btn"]') }
	get outcome() { return this.wrapper.find('[data-testid="step4-outcome"]') }

	async clickInstall() { await this.installBtn.trigger('click') }
	async clickSkip() { await this.skipBtn.trigger('click') }
	async setFolder(value: string) { await this.folderInput.setValue(value) }
}
