import type { VueWrapper } from '@vue/test-utils';

/**
 * PageObject for `ThreadTab.vue` (T-MPS-075, SPEC-MPS-001 §8.1).
 *
 * Elements are queried exclusively by `data-testid` per ADR-009; no CSS
 * class / id selectors are permitted in `tests/**`.
 */
export class ThreadTabPO {
	constructor(
		private readonly wrapper: VueWrapper,
		private readonly threadId: string,
	) {}

	private byTid(tid: string) {
		return `[data-testid="${tid}"]`;
	}

	get root() {
		return this.wrapper.find(this.byTid(`thread-tab-${this.threadId}`));
	}

	get label() {
		return this.wrapper.find(this.byTid(`thread-tab-${this.threadId}-label`));
	}

	get renameInput() {
		return this.wrapper.find(
			this.byTid(`thread-tab-${this.threadId}-rename-input`),
		);
	}

	get contextMenuButton() {
		return this.wrapper.find(
			this.byTid(`thread-tab-${this.threadId}-context-menu`),
		);
	}

	isActive(): boolean {
		return this.root.attributes('aria-selected') === 'true';
	}

	async click(): Promise<void> {
		await this.root.trigger('click');
	}

	async doubleClickLabel(): Promise<void> {
		await this.label.trigger('dblclick');
	}

	async submitRename(value: string): Promise<void> {
		await this.renameInput.setValue(value);
		await this.renameInput.trigger('keydown', { key: 'Enter' });
	}

	async cancelRename(): Promise<void> {
		await this.renameInput.trigger('keydown', { key: 'Escape' });
	}

	async openContextMenu(): Promise<void> {
		await this.contextMenuButton.trigger('click');
	}

	async rightClick(): Promise<void> {
		await this.root.trigger('contextmenu');
	}
}
