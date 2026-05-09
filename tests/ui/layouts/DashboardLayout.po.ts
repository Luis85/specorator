import type { VueWrapper } from '@vue/test-utils'

const TID = {
	root: 'layout-dashboard',
	header: 'layout-dashboard-header',
	body: 'layout-dashboard-body',
	footer: 'layout-dashboard-footer',
} as const

export class DashboardLayoutPageObject {
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
