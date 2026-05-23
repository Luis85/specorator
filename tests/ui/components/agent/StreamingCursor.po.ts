import type { VueWrapper } from '@vue/test-utils';

const TID = {
	root: 'streaming-cursor',
} as const;

/**
 * PageObject for `<StreamingCursor>` (REQ-AUX-008, spec §1.3.6).
 * Queries by `data-testid` only.
 */
export class StreamingCursorPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	exists(): boolean {
		return this.wrapper.find(this.byTid(TID.root)).exists();
	}

	root(): HTMLElement {
		return this.wrapper.get(this.byTid(TID.root)).element as HTMLElement;
	}

	ariaHidden(): string | null {
		return this.root().getAttribute('aria-hidden');
	}

	animationName(): string {
		return getComputedStyle(this.root()).animationName;
	}
}
