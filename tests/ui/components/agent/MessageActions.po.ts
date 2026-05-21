import type { VueWrapper } from '@vue/test-utils';

export class MessageActionsPO {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string) {
		return `[data-testid="${tid}"]`;
	}

	get container() {
		return this.wrapper.find(this.byTid('message-actions'));
	}

	get copyButton() {
		return this.wrapper.find(this.byTid('message-action-copy'));
	}

	get regenerateButton() {
		return this.wrapper.find(this.byTid('message-action-regenerate'));
	}

	get editButton() {
		return this.wrapper.find(this.byTid('message-action-edit'));
	}
}
