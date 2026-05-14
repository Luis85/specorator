import type { VueWrapper } from '@vue/test-utils'

export class ChatSidebarPO {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string) {
		return `[data-testid="${tid}"]`
	}

	get sidebar() {
		return this.wrapper.find(this.byTid('chat-sidebar'))
	}

	get degradedHeading() {
		return this.wrapper.find(this.byTid('chat-degraded-heading'))
	}

	get settingsLink() {
		return this.wrapper.find(this.byTid('chat-degraded-settings-link'))
	}

	get textarea() {
		return this.wrapper.find(this.byTid('chat-input-textarea'))
	}

	get sendButton() {
		return this.wrapper.find(this.byTid('chat-send-button'))
	}

	get responseLoading() {
		return this.wrapper.find(this.byTid('chat-response-loading'))
	}

	get responseText() {
		return this.wrapper.find(this.byTid('chat-response-text'))
	}

	get responseError() {
		return this.wrapper.find(this.byTid('chat-response-error'))
	}

	get trimNotice() {
		return this.wrapper.find(this.byTid('chat-response-trim-notice'))
	}

	hasSidebar(): boolean {
		return this.sidebar.exists()
	}

	hasDegradedHeading(): boolean {
		return this.degradedHeading.exists()
	}

	hasSettingsLink(): boolean {
		return this.settingsLink.exists()
	}

	hasTextarea(): boolean {
		return this.textarea.exists()
	}

	hasSendButton(): boolean {
		return this.sendButton.exists()
	}

	hasResponseLoading(): boolean {
		return this.responseLoading.exists()
	}

	hasResponseText(): boolean {
		return this.responseText.exists()
	}

	hasResponseError(): boolean {
		return this.responseError.exists()
	}

	hasTrimNotice(): boolean {
		return this.trimNotice.exists()
	}

	degradedHeadingText(): string {
		return this.degradedHeading.text()
	}

	responseTextContent(): string {
		return this.responseText.text()
	}

	responseErrorContent(): string {
		return this.responseError.text()
	}

	isSendButtonDisabled(): boolean {
		return (this.sendButton.element as HTMLButtonElement).disabled
	}

	async typeAndSend(text: string): Promise<void> {
		const ta = this.textarea.element as HTMLTextAreaElement
		ta.value = text
		await this.textarea.trigger('input')
		await this.sendButton.trigger('click')
	}

	async clickSend(): Promise<void> {
		await this.sendButton.trigger('click')
	}
}
