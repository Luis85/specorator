import type { VueWrapper } from '@vue/test-utils'

const TID = {
	root: 'layout-main',
	header: 'layout-main-header',
	body: 'layout-main-body',
	footer: 'layout-main-footer',
} as const

export class MainLayoutPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string) {
		return `[data-testid="${tid}"]`
	}

	get root() {
		return this.wrapper.get(this.byTid(TID.root))
	}

	header() {
		return this.wrapper.find(this.byTid(TID.header))
	}

	get body() {
		return this.wrapper.get(this.byTid(TID.body))
	}

	footer() {
		return this.wrapper.find(this.byTid(TID.footer))
	}
}
