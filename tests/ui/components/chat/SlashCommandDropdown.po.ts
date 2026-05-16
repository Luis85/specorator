import type { DOMWrapper, VueWrapper } from '@vue/test-utils';

export class SlashCommandDropdownPO {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string) {
		return `[data-testid="${tid}"]`;
	}

	get root() {
		return this.wrapper.find(this.byTid('slash-command-dropdown'));
	}

	get list() {
		return this.wrapper.find(this.byTid('slash-command-list'));
	}

	get empty() {
		return this.wrapper.find(this.byTid('slash-command-empty'));
	}

	hasList(): boolean {
		return this.list.exists();
	}

	hasEmpty(): boolean {
		return this.empty.exists();
	}

	emptyText(): string {
		return this.empty.text();
	}

	rootRole(): string | undefined {
		return this.root.attributes('role');
	}

	items(): DOMWrapper<Element>[] {
		return this.wrapper.findAll('[role="option"]');
	}

	itemByName(name: string) {
		return this.wrapper.find(this.byTid(`slash-command-item-${name}`));
	}

	itemAriaSelected(name: string): string | undefined {
		return this.itemByName(name).attributes('aria-selected');
	}

	itemNameText(name: string): string {
		return this.itemByName(name).find(this.byTid('slash-command-name')).text();
	}

	itemDescriptionText(name: string): string {
		return this.itemByName(name).find(this.byTid('slash-command-description')).text();
	}

	async clickItem(name: string): Promise<void> {
		await this.itemByName(name).trigger('mousedown');
	}

	async hoverItem(name: string): Promise<void> {
		await this.itemByName(name).trigger('mouseenter');
	}

	emitted(name: string): unknown {
		return this.wrapper.emitted(name);
	}
}
