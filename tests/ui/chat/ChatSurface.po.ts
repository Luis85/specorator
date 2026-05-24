import type { VueWrapper } from '@vue/test-utils';

/** PageObject for `ChatSurface.vue` (SPEC-CC-018). Queries by `data-testid` only (ADR-009). */
export class ChatSurfacePageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	exists(): boolean {
		return this.wrapper.find('[data-testid="chat-surface"]').exists();
	}

	providerAttr(): string | undefined {
		return this.wrapper.get('[data-testid="chat-surface"]').attributes('data-provider');
	}

	showsWelcome(): boolean {
		return this.wrapper.find('[data-testid="chat-welcome"]').exists();
	}

	showsMessageList(): boolean {
		return this.wrapper.find('[data-testid="message-list"]').exists();
	}

	showsBusy(): boolean {
		return this.wrapper.find('[data-testid="chat-busy"]').exists();
	}

	busyAriaLive(): string | undefined {
		return this.wrapper.get('[data-testid="chat-busy"]').attributes('aria-live');
	}

	assistantText(): string {
		return this.wrapper.get('[data-testid="message-assistant"]').text();
	}

	hasInterruptedBadge(): boolean {
		return this.wrapper.find('[data-testid="message-interrupted"]').exists();
	}

	sendDisabled(): boolean {
		return (this.wrapper.get('[data-testid="composer-send"]').element as HTMLButtonElement).disabled;
	}

	async typeAndSend(text: string): Promise<void> {
		const textarea = this.wrapper.get('[data-testid="composer-textarea"]');
		await textarea.setValue(text);
		await this.wrapper.get('[data-testid="composer-send"]').trigger('click');
	}

	async clickStop(): Promise<void> {
		await this.wrapper.get('[data-testid="composer-send"]').trigger('click');
	}
}
