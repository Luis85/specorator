import type { VueWrapper } from '@vue/test-utils';

const TID = {
	root: 'message-bubble',
	body: 'message-bubble-body',
} as const;

/**
 * PageObject for `<MessageBubble>` (REQ-AUX-005, spec §1.4).
 * Queries by `data-testid` only.
 */
export class MessageBubblePageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	root(): HTMLElement {
		return this.wrapper.get(this.byTid(TID.root)).element as HTMLElement;
	}

	role(): string | null {
		return this.root().getAttribute('data-role');
	}

	alignSelf(): string {
		return getComputedStyle(this.root()).alignSelf;
	}

	backgroundColor(): string {
		return getComputedStyle(this.root()).backgroundColor;
	}

	borderEndEndRadius(): string {
		return getComputedStyle(this.root()).borderEndEndRadius;
	}

	dirAttr(): string | null {
		return this.root().getAttribute('dir');
	}

	bodyExists(): boolean {
		return this.wrapper.find(this.byTid(TID.body)).exists();
	}

	unicodeBidi(): string {
		const body = this.wrapper.get(this.byTid(TID.body)).element as HTMLElement;
		return getComputedStyle(body).unicodeBidi;
	}
}
