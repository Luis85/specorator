import type { VueWrapper } from '@vue/test-utils';

/** PageObject for `WelcomeGreeting.vue` (SPEC-CC-020). Queries by `data-testid` only (ADR-009). */
export class WelcomeGreetingPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	exists(): boolean {
		return this.wrapper.find('[data-testid="chat-welcome"]').exists();
	}

	text(): string {
		return this.wrapper.get('[data-testid="chat-welcome"]').text();
	}
}
