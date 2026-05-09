import type { VueWrapper } from '@vue/test-utils'

const TID = {
	root: 'app-root',
	mainLayout: 'layout-main',
	dashboardLayout: 'layout-dashboard',
	panelLayout: 'layout-panel',
} as const

export class AppRootPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string) {
		return `[data-testid="${tid}"]`
	}

	get root() {
		return this.wrapper.get(this.byTid(TID.root))
	}

	mainLayout() {
		return this.wrapper.find(this.byTid(TID.mainLayout))
	}

	dashboardLayout() {
		return this.wrapper.find(this.byTid(TID.dashboardLayout))
	}

	panelLayout() {
		return this.wrapper.find(this.byTid(TID.panelLayout))
	}
}
