import type { VueWrapper } from '@vue/test-utils'

const TID = {
	root: 'thread-tab-badge',
} as const

export class ThreadTabBadgePageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`
	}

	get rootEl(): HTMLElement {
		return this.wrapper.get(this.byTid(TID.root)).element as HTMLElement
	}

	state(): string | null {
		return this.rootEl.getAttribute('data-state')
	}

	digitText(): string {
		return this.rootEl.textContent.trim()
	}
}
