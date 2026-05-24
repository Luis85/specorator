import type { VueWrapper } from '@vue/test-utils';

const TID = {
	composer: 'chat-composer',
	textarea: 'composer-textarea',
	send: 'composer-send',
} as const;

/** PageObject for `ChatComposer.vue` (SPEC-CC-021). Queries by `data-testid` only (ADR-009). */
export class ChatComposerPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	exists(): boolean {
		return this.wrapper.find(this.byTid(TID.composer)).exists();
	}

	get textarea() {
		return this.wrapper.get(this.byTid(TID.textarea));
	}

	get send() {
		return this.wrapper.get(this.byTid(TID.send));
	}

	async setValue(value: string): Promise<void> {
		await this.textarea.setValue(value);
	}

	value(): string {
		return (this.textarea.element as HTMLTextAreaElement).value;
	}

	sendDisabled(): boolean {
		return (this.send.element as HTMLButtonElement).disabled;
	}

	sendLabel(): string {
		return this.send.attributes('aria-label') ?? '';
	}

	async pressEnter(
		modifiers: { shift?: boolean; composing?: boolean } = {},
	): Promise<KeyboardEvent> {
		const event = new KeyboardEvent('keydown', {
			key: 'Enter',
			shiftKey: modifiers.shift ?? false,
			cancelable: true,
		});
		if (modifiers.composing) Object.defineProperty(event, 'isComposing', { value: true });
		this.textarea.element.dispatchEvent(event);
		await this.wrapper.vm.$nextTick();
		return event;
	}

	async pressEsc(): Promise<void> {
		await this.textarea.trigger('keydown', { key: 'Escape' });
	}

	async clickSend(): Promise<void> {
		await this.send.trigger('click');
	}
}
