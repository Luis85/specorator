import type { VueWrapper } from '@vue/test-utils'
import { DOMWrapper as DOMWrapperCtor } from '@vue/test-utils'

export class ChatInputPO {
	constructor(public readonly wrapper: VueWrapper) {}

	private byTid(tid: string) {
		return `[data-testid="${tid}"]`
	}

	/**
	 * WS-AUX-8c: slash + mention dropdowns are rendered through
	 * `<SpDropdownPanel>` which uses `<Teleport to="body">`. Lookups for
	 * dropdown elements therefore go through `document` instead of the mounted
	 * wrapper subtree, while the testid contract is preserved.
	 */
	private findOneInDocument(selector: string) {
		return new DOMWrapperCtor<Element>(document.querySelector(selector))
	}

	private findAllInDocument(selector: string) {
		return Array.from(document.querySelectorAll(selector)).map(
			(el) => new DOMWrapperCtor<Element>(el),
		)
	}

	mentionDropdownExists(): boolean {
		return this.findOneInDocument(this.byTid('mention-dropdown')).exists()
	}

	mentionOptionAt(index: number) {
		return this.findOneInDocument(this.byTid(`mention-option-${index}`))
	}

	mentionOptionPaths(): string[] {
		return this.findAllInDocument('[role="option"]').map((el) => {
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

	async pressKey(
		key: string,
		modifiers: { ctrl?: boolean; meta?: boolean; shift?: boolean; alt?: boolean } = {},
	): Promise<void> {
		await this.textarea.trigger('keydown', {
			key,
			ctrlKey: modifiers.ctrl ?? false,
			metaKey: modifiers.meta ?? false,
			shiftKey: modifiers.shift ?? false,
			altKey: modifiers.alt ?? false,
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

	/**
	 * Send gesture: plain Enter with no modifiers (current shipping contract —
	 * Ctrl+Enter was retired in favour of the simpler keymap).
	 * The `_ignored` parameter is retained for source-compat with existing call
	 * sites; modifiers no longer affect the send path.
	 */
	async triggerSendKey(_ignored = false): Promise<void> {
		await this.textarea.trigger('keydown', {
			key: 'Enter',
			ctrlKey: false,
			metaKey: false,
			shiftKey: false,
			altKey: false,
		})
	}

	/** Shift+Enter: must NOT send — leaves textarea to insert a newline. */
	async triggerShiftEnter(): Promise<void> {
		await this.textarea.trigger('keydown', {
			key: 'Enter',
			ctrlKey: false,
			metaKey: false,
			shiftKey: true,
			altKey: false,
		})
	}

	/** Alias of `triggerSendKey` retained for readability at call sites. */
	async triggerEnterOnly(): Promise<void> {
		await this.triggerSendKey()
	}

	async clickSendButton(): Promise<void> {
		await this.sendButton.trigger('click')
	}

	get dropdown() {
		return this.findOneInDocument(this.byTid('slash-command-dropdown'))
	}

	get dropdownEmpty() {
		return this.findOneInDocument(this.byTid('slash-command-empty'))
	}

	hasDropdown(): boolean {
		return this.dropdown.exists()
	}

	dropdownItem(name: string) {
		return this.findOneInDocument(this.byTid(`slash-command-item-${name}`))
	}

	dropdownItems() {
		return this.findAllInDocument('[role="option"]')
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

	emitted(name: string): unknown {
		return this.wrapper.emitted(name)
	}
}
