import type { VueWrapper } from '@vue/test-utils';

/**
 * PageObject for `MessageList.vue`'s compact-boundary notice rendering
 * (Codex P2 on PR #379). Queries by `data-testid` only — ADR-009.
 */
export class MessageListCompactBoundaryPO {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string) {
		return `[data-testid="${tid}"]`;
	}

	get root() {
		return this.wrapper.find(this.byTid('agent-message-list'));
	}

	notices() {
		return this.wrapper.findAll(this.byTid('compact-boundary-notice'));
	}

	firstNotice() {
		return this.notices()[0];
	}

	userMessages() {
		return this.wrapper.findAll(this.byTid('agent-message-user'));
	}

	assistantMessages() {
		return this.wrapper.findAll(this.byTid('agent-message-assistant'));
	}
}
