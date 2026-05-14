import type { VueWrapper } from '@vue/test-utils'

export class SubprocessStartingPillPO {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string) {
		return `[data-testid="${tid}"]`
	}

	get rootEl() {
		return this.wrapper.find(this.byTid('chat-subprocess-starting'))
	}

	exists(): boolean {
		return this.rootEl.exists()
	}

	role(): string | undefined {
		return this.rootEl.attributes('role')
	}

	ariaLive(): string | undefined {
		return this.rootEl.attributes('aria-live')
	}

	text(): string {
		return this.rootEl.text()
	}
}
