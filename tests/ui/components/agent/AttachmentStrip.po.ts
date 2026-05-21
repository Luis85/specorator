import type { VueWrapper } from '@vue/test-utils';

export class AttachmentStripPO {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string) {
		return `[data-testid="${tid}"]`;
	}

	get root() {
		return this.wrapper.find(this.byTid('attachment-strip'));
	}

	chip(label: string) {
		return this.wrapper.find(this.byTid(`attachment-chip-${label}`));
	}

	chips() {
		return this.wrapper.findAll('[data-testid^="attachment-chip-"]');
	}
}
