import type { VueWrapper } from '@vue/test-utils'

const TID = {
	form: 'create-form',
	titleInput: 'feature-title-input',
	areaInput: 'feature-area-input',
	submit: 'create-submit',
	cancel: 'create-cancel',
} as const

export class CreateFeatureFormPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string) {
		return `[data-testid="${tid}"]`
	}

	get form() {
		return this.wrapper.get(this.byTid(TID.form))
	}

	get titleInput() {
		return this.wrapper.get(this.byTid(TID.titleInput))
	}

	get titleValue(): string {
		return (this.titleInput.element as HTMLInputElement).value
	}

	get cancelButton() {
		return this.wrapper.get(this.byTid(TID.cancel))
	}

	async setTitle(value: string): Promise<void> {
		await this.titleInput.setValue(value)
	}

	async submit(): Promise<void> {
		await this.form.trigger('submit')
	}

	async clickCancel(): Promise<void> {
		await this.cancelButton.trigger('click')
	}

	emitted(name: string): unknown {
		return this.wrapper.emitted(name)
	}
}
