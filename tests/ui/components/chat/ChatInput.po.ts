import type { VueWrapper } from '@vue/test-utils'

export class ChatInputPO {
	constructor(public readonly wrapper: VueWrapper) {}

	private byTid(tid: string) {
		return `[data-testid="${tid}"]`
	}

	mentionDropdownExists(): boolean {
		return this.wrapper.find(this.byTid('mention-dropdown')).exists()
	}

	mentionOptionAt(index: number) {
		return this.wrapper.find(this.byTid(`mention-option-${index}`))
	}

	mentionOptionPaths(): string[] {
		return this.wrapper.findAll('[role="option"]').map((el) => {
			const path = el.find('[data-testid^="mention-option-"] > :last-child')
			return path.exists() ? path.text() : ''
		})
	}

	async typeAndMoveCaretToEnd(value: string): Promise<void> {
		const el = this.textarea.element as HTMLTextAreaElement
		el.value = value
		el.setSelectionRange(value.length, value.length)
		await this.textarea.trigger('input')
	}

	async pressKey(key: string, modifiers: { ctrl?: boolean; meta?: boolean } = {}): Promise<void> {
		await this.textarea.trigger('keydown', {
			key,
			ctrlKey: modifiers.ctrl ?? false,
			metaKey: modifiers.meta ?? false,
		})
	}

	get textarea() {
		return this.wrapper.find(this.byTid('chat-input-textarea'))
	}

	get sendButton() {
		return this.wrapper.find(this.byTid('chat-send-button'))
	}

	hasTextarea(): boolean {
		return this.textarea.exists()
	}

	hasSendButton(): boolean {
		return this.sendButton.exists()
	}

	textareaValue(): string {
		return (this.textarea.element as HTMLTextAreaElement).value
	}

	isTextareaReadonly(): boolean {
		return (this.textarea.element as HTMLTextAreaElement).readOnly
	}

	isSendButtonDisabled(): boolean {
		return (this.sendButton.element as HTMLButtonElement).disabled
	}

	sendButtonText(): string {
		return this.sendButton.text()
	}

	async typeInTextarea(value: string): Promise<void> {
		await this.textarea.setValue(value)
	}

	async triggerSendKey(ctrl = true): Promise<void> {
		await this.textarea.trigger('keydown', {
			key: 'Enter',
			ctrlKey: ctrl,
			metaKey: !ctrl,
		})
	}

	async triggerEnterOnly(): Promise<void> {
		await this.textarea.trigger('keydown', { key: 'Enter', ctrlKey: false, metaKey: false })
	}

	async clickSendButton(): Promise<void> {
		await this.sendButton.trigger('click')
	}

	get dropdown() {
		return this.wrapper.find(this.byTid('slash-command-dropdown'))
	}

	get dropdownEmpty() {
		return this.wrapper.find(this.byTid('slash-command-empty'))
	}

	hasDropdown(): boolean {
		return this.dropdown.exists()
	}

	dropdownItem(name: string) {
		return this.wrapper.find(this.byTid(`slash-command-item-${name}`))
	}

	dropdownItems() {
		return this.wrapper.findAll('[role="option"]')
	}

	/**
	 * Simulate typing into the textarea AND set the caret to end-of-string,
	 * since `setValue` does not synthesise caret position. The component reads
	 * `selectionStart` to detect the slash trigger, so tests must move the
	 * caret explicitly.
	 */
	async typeAndMoveCaret(value: string, caret?: number): Promise<void> {
		const el = this.textarea.element as HTMLTextAreaElement
		el.value = value
		const pos = caret ?? value.length
		el.selectionStart = pos
		el.selectionEnd = pos
		await this.textarea.trigger('input')
	}

	async pressKey(key: string, opts: { ctrl?: boolean; meta?: boolean } = {}): Promise<void> {
		await this.textarea.trigger('keydown', {
			key,
			ctrlKey: opts.ctrl ?? false,
			metaKey: opts.meta ?? false,
		})
	}

	emitted(name: string): unknown {
		return this.wrapper.emitted(name)
	}
}
