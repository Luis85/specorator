import type { VueWrapper } from '@vue/test-utils'

const TID = {
	root: 'hello-view',
} as const

export class HelloViewPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string) {
		return `[data-testid="${tid}"]`
	}

	get root() {
		return this.wrapper.get(this.byTid(TID.root))
	}
}
