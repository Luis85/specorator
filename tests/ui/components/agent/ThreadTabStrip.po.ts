import type { VueWrapper } from '@vue/test-utils';

/**
 * PageObject for `ThreadTabStrip.vue` (T-MPS-077/078, SPEC-MPS-001 §8.1).
 *
 * Queries are exclusively by `data-testid` per ADR-009. The strip exposes:
 *   - `thread-tab-strip`            — container `<ul role="tablist">`
 *   - `thread-tab-{id}`             — each tab (delegated to `ThreadTab.vue`)
 *   - `thread-tab-new`              — "+" new-thread button
 *   - `thread-tab-active`           — alias resolving to the active tab
 */
export class ThreadTabStripPO {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string) {
		return `[data-testid="${tid}"]`;
	}

	get root() {
		return this.wrapper.find(this.byTid('thread-tab-strip'));
	}

	get newThreadButton() {
		return this.wrapper.find(this.byTid('thread-tab-new'));
	}

	get activeTab() {
		return this.wrapper.find(this.byTid('thread-tab-active'));
	}

	tabs() {
		return this.wrapper.findAll('[data-testid^="thread-tab-"]').filter((w) => {
			const tid = w.attributes('data-testid') ?? '';
			return (
				tid.startsWith('thread-tab-') &&
				tid !== 'thread-tab-strip' &&
				tid !== 'thread-tab-new' &&
				tid !== 'thread-tab-active' &&
				tid !== 'thread-tab-badge' &&
				!tid.includes('-label') &&
				!tid.includes('-rename-input') &&
				!tid.includes('-context-menu')
			);
		});
	}

	tabIdsInOrder(): string[] {
		return this.tabs().map((w) => {
			const tid = w.attributes('data-testid') ?? '';
			return tid.replace(/^thread-tab-/, '');
		});
	}

	tabByThreadId(threadId: string) {
		return this.wrapper.find(this.byTid(`thread-tab-${threadId}`));
	}

	async clickTab(threadId: string): Promise<void> {
		await this.tabByThreadId(threadId).trigger('click');
	}

	async clickNewThread(): Promise<void> {
		await this.newThreadButton.trigger('click');
	}

	async pressKey(threadId: string, key: string): Promise<void> {
		await this.tabByThreadId(threadId).trigger('keydown', { key });
	}

	focusedTabId(): string | null {
		for (const w of this.tabs()) {
			if (w.attributes('tabindex') === '0') {
				const tid = w.attributes('data-testid') ?? '';
				return tid.replace(/^thread-tab-/, '');
			}
		}
		return null;
	}
}
