import type { VueWrapper } from '@vue/test-utils';

export class MessageListPO {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string) {
		return `[data-testid="${tid}"]`;
	}

	get root() {
		return this.wrapper.find(this.byTid('agent-message-list'));
	}

	get empty() {
		return this.wrapper.find(this.byTid('agent-message-list-empty'));
	}

	userMessages() {
		return this.wrapper.findAll(this.byTid('agent-message-user'));
	}

	assistantMessages() {
		return this.wrapper.findAll(this.byTid('agent-message-assistant'));
	}

	trimNotes() {
		return this.wrapper.findAll(this.byTid('agent-message-trim-note'));
	}

	emptyAssistantPlaceholders() {
		return this.wrapper.findAll(this.byTid('agent-message-empty'));
	}
}
