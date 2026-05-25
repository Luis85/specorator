import type { VueWrapper } from '@vue/test-utils';

const TID = {
	root: 'file-chips',
	chip: 'file-chip',
	link: 'file-chip-link',
	remove: 'file-chip-remove',
} as const;

/** PageObject for `FileChips.vue` (SPEC-CA-019). Queries by `data-testid` only (ADR-009). */
export class FileChipsPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	rootExists(): boolean {
		return this.wrapper.find(this.byTid(TID.root)).exists();
	}

	/** The labelled-list aria-label on the root. */
	rootAriaLabel(): string {
		return this.wrapper.get(this.byTid(TID.root)).attributes('aria-label') ?? '';
	}

	chipCount(): number {
		return this.wrapper.findAll(this.byTid(TID.chip)).length;
	}

	/** The visible chip text (the `displayName`) at `index`. */
	linkText(index: number): string {
		return this.wrapper.findAll(this.byTid(TID.link))[index].text();
	}

	/** The wikilink form exposed on the link element (an attribute, not raw HTML). */
	linkTitle(index: number): string {
		return this.wrapper.findAll(this.byTid(TID.link))[index].attributes('title') ?? '';
	}

	removeAriaLabel(index: number): string {
		return this.wrapper.findAll(this.byTid(TID.remove))[index].attributes('aria-label') ?? '';
	}

	async clickLink(index: number): Promise<void> {
		await this.wrapper.findAll(this.byTid(TID.link))[index].trigger('click');
	}

	async pressKeyLink(index: number, key: string): Promise<void> {
		await this.wrapper.findAll(this.byTid(TID.link))[index].trigger('keydown', { key });
	}

	async clickRemove(index: number): Promise<void> {
		await this.wrapper.findAll(this.byTid(TID.remove))[index].trigger('click');
	}

	async pressKeyRemove(index: number, key: string): Promise<void> {
		await this.wrapper.findAll(this.byTid(TID.remove))[index].trigger('keydown', { key });
	}

	/** The raw innerHTML of the chips root — for the no-`v-html` / verbatim-text assertion. */
	rootHtml(): string {
		return this.wrapper.get(this.byTid(TID.root)).element.innerHTML;
	}
}
