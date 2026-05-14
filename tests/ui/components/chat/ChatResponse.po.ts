import type { VueWrapper } from '@vue/test-utils'

export class ChatResponsePO {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string) {
		return `[data-testid="${tid}"]`
	}

	get idleEl() {
		return this.wrapper.find(this.byTid('chat-response-idle'))
	}

	get loadingEl() {
		return this.wrapper.find(this.byTid('chat-response-loading'))
	}

	get textEl() {
		return this.wrapper.find(this.byTid('chat-response-text'))
	}

	get errorEl() {
		return this.wrapper.find(this.byTid('chat-response-error'))
	}

	get trimNoticeEl() {
		return this.wrapper.find(this.byTid('chat-response-trim-notice'))
	}

	get structuredFailEl() {
		return this.wrapper.find(this.byTid('chat-response-structured-fail'))
	}

	hasIdle(): boolean {
		return this.idleEl.exists()
	}

	hasLoading(): boolean {
		return this.loadingEl.exists()
	}

	hasText(): boolean {
		return this.textEl.exists()
	}

	hasError(): boolean {
		return this.errorEl.exists()
	}

	hasTrimNotice(): boolean {
		return this.trimNoticeEl.exists()
	}

	hasStructuredFail(): boolean {
		return this.structuredFailEl.exists()
	}

	structuredFailRole(): string | undefined {
		return this.structuredFailEl.attributes('role')
	}

	structuredFailAriaLive(): string | undefined {
		return this.structuredFailEl.attributes('aria-live')
	}

	structuredFailContent(): string {
		return this.structuredFailEl.text()
	}

	loadingRole(): string | undefined {
		return this.loadingEl.attributes('role')
	}

	loadingAriaLive(): string | undefined {
		return this.loadingEl.attributes('aria-live')
	}

	errorRole(): string | undefined {
		return this.errorEl.attributes('role')
	}

	errorAriaLive(): string | undefined {
		return this.errorEl.attributes('aria-live')
	}

	trimNoticeRole(): string | undefined {
		return this.trimNoticeEl.attributes('role')
	}

	textContent(): string {
		return this.textEl.text()
	}

	errorContent(): string {
		return this.errorEl.text()
	}
}
