import type { VueWrapper } from '@vue/test-utils';

/** PageObject for `MessageTurn.vue` (SPEC-CC-019). Queries by `data-testid` only (ADR-009). */
export class MessageTurnPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	isUser(): boolean {
		return this.wrapper.find('[data-testid="message-user"]').exists();
	}

	isAssistant(): boolean {
		return this.wrapper.find('[data-testid="message-assistant"]').exists();
	}

	root() {
		const user = this.wrapper.find('[data-testid="message-user"]');
		return user.exists() ? user : this.wrapper.get('[data-testid="message-assistant"]');
	}

	streamingAttr(): string | undefined {
		return this.root().attributes('data-streaming');
	}

	dirAttr(): string | undefined {
		return this.root().attributes('dir');
	}

	hasInterruptedBadge(): boolean {
		return this.wrapper.find('[data-testid="message-interrupted"]').exists();
	}

	text(): string {
		return this.root().text();
	}
}
