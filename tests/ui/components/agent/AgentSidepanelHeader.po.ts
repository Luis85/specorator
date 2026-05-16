import type { VueWrapper } from '@vue/test-utils';

export class AgentSidepanelHeaderPO {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string) {
		return `[data-testid="${tid}"]`;
	}

	get root() {
		return this.wrapper.find(this.byTid('agent-header'));
	}

	get title() {
		return this.wrapper.find(this.byTid('agent-header-title'));
	}

	get newConversationButton() {
		return this.wrapper.find(this.byTid('agent-header-new-conversation'));
	}

	get featureChip() {
		return this.wrapper.find(this.byTid('agent-header-feature'));
	}

	get featureEmpty() {
		return this.wrapper.find(this.byTid('agent-header-feature-empty'));
	}

	titleText(): string {
		return this.title.text();
	}

	newConversationDisabled(): boolean {
		return this.newConversationButton.attributes('disabled') !== undefined;
	}

	async clickNewConversation(): Promise<void> {
		await this.newConversationButton.trigger('click');
	}
}
