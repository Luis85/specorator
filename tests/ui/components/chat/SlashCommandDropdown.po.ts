import type { DOMWrapper, VueWrapper } from '@vue/test-utils';
import { DOMWrapper as DOMWrapperCtor } from '@vue/test-utils';

/**
 * Page object for `<SlashCommandDropdown>`. WS-AUX-8c routed the dropdown
 * through `<SpDropdownPanel>`, which `<Teleport>`s its content to
 * `document.body`. Element lookups therefore go through `document` rather
 * than `wrapper.element`, but the testid-only contract is preserved.
 */
export class SlashCommandDropdownPO {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	private findOne(selector: string): DOMWrapper<Element> {
		// `DOMWrapper` accepts a nullish element and exposes `.exists()` as
		// `false` in that case — matches the behaviour of `wrapper.find()`.
		return new DOMWrapperCtor(document.querySelector(selector));
	}

	private findAll(selector: string): DOMWrapper<Element>[] {
		return Array.from(document.querySelectorAll(selector)).map(
			(el) => new DOMWrapperCtor(el),
		);
	}

	get root(): DOMWrapper<Element> {
		return this.findOne(this.byTid('slash-command-dropdown'));
	}

	get list(): DOMWrapper<Element> {
		return this.findOne(this.byTid('slash-command-list'));
	}

	get empty(): DOMWrapper<Element> {
		return this.findOne(this.byTid('slash-command-empty'));
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
		return this.findAll('[role="option"]');
	}

	itemByName(name: string): DOMWrapper<Element> {
		return this.findOne(this.byTid(`slash-command-item-${name}`));
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

	itemSourceLabel(name: string): string | null {
		const source = this.findOne(this.byTid(`slash-command-source-${name}`));
		return source.exists() ? source.text() : null;
	}

	itemHintText(name: string): string | null {
		const hint = this.findOne(this.byTid(`slash-command-hint-${name}`));
		return hint.exists() ? hint.text() : null;
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
