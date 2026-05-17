import type { VueWrapper } from '@vue/test-utils'

export class SessionResumeIndicatorPO {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string) {
		return `[data-testid="${tid}"]`
	}

	get rootEl() {
		return this.wrapper.find(this.byTid('chat-session-resume'))
	}

	get glyphEl() {
		return this.wrapper.find(this.byTid('chat-session-resume-glyph'))
	}

	get labelEl() {
		return this.wrapper.find(this.byTid('chat-session-resume-label'))
	}

	exists(): boolean {
		return this.rootEl.exists()
	}

	ariaLabel(): string | undefined {
		return this.rootEl.attributes('aria-label')
	}

	glyphAriaHidden(): string | undefined {
		return this.glyphEl.attributes('aria-hidden')
	}

	glyphText(): string {
		return this.glyphEl.text()
	}

	labelText(): string {
		return this.labelEl.text()
	}

	hasLabel(): boolean {
		return this.labelEl.exists()
	}

	rootText(): string {
		return this.rootEl.text()
	}
}
