import type { VueWrapper } from '@vue/test-utils'

const TID = {
	root: 'layout-panel',
	header: 'layout-panel-header',
	body: 'layout-panel-body',
	footer: 'layout-panel-footer',
} as const

export class PanelLayoutPageObject {
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
