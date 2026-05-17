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

	markdownBlocks() {
		return this.wrapper.findAll(this.byTid('agent-markdown-block'));
	}

	compactBoundaryNotices() {
		return this.wrapper.findAll(this.byTid('compact-boundary-notice'));
	}

	get emptyTilesContainer() {
		return this.wrapper.find(this.byTid('agent-message-list-empty-tiles'));
	}

	emptyTile(key: 'slash' | 'mention' | 'send' | 'escape') {
		return this.wrapper.find(this.byTid(`agent-message-list-empty-tile-${key}`));
	}

	emptyTiles() {
		return this.wrapper.findAll('[data-testid^="agent-message-list-empty-tile-"]');
	}

	get newMessagesPill() {
		return this.wrapper.find(this.byTid('agent-message-new-pill'));
	}
}
