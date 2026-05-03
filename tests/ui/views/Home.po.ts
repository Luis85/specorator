import type { VueWrapper } from '@vue/test-utils'

const TID = {
	title: 'home-title',
	createButton: 'home-create-feature',
	activeList: 'home-active-features',
	createForm: 'create-form',
} as const

export class HomePageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string) {
		return `[data-testid="${tid}"]`
	}

	get title() {
		return this.wrapper.get(this.byTid(TID.title))
	}

	get createButton() {
		return this.wrapper.get(this.byTid(TID.createButton))
	}

	get activeList() {
		return this.wrapper.find(this.byTid(TID.activeList))
	}

	isCreateFormVisible(): boolean {
		return this.wrapper.find(this.byTid(TID.createForm)).exists()
	}

	async clickCreate(): Promise<void> {
		await this.createButton.trigger('click')
	}
}
