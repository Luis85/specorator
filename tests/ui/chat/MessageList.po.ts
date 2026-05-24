import type { VueWrapper } from '@vue/test-utils';

/** PageObject for `MessageList.vue` (SPEC-CC-019). Queries by `data-testid` only (ADR-009). */
export class MessageListPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	exists(): boolean {
		return this.wrapper.find('[data-testid="message-list"]').exists();
	}

	turnCount(): number {
		return (
			this.wrapper.findAll('[data-testid="message-user"]').length +
			this.wrapper.findAll('[data-testid="message-assistant"]').length
		);
	}

	assistantText(): string {
		return this.wrapper.get('[data-testid="message-assistant"]').text();
	}
}
