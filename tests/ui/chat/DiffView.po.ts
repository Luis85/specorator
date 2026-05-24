import type { VueWrapper } from '@vue/test-utils';

const TID = {
	root: 'diff-view',
	line: 'diff-line',
	gutter: 'diff-line-gutter',
	text: 'diff-line-text',
	more: 'diff-more',
	separator: 'diff-separator',
} as const;

/** PageObject for `DiffView.vue` (SPEC-RR-029). Queries by `data-testid` only (ADR-009). */
export class DiffViewPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	exists(): boolean {
		return this.wrapper.find(this.byTid(TID.root)).exists();
	}

	lineCount(): number {
		return this.wrapper.findAll(this.byTid(TID.line)).length;
	}

	lineTexts(): string[] {
		return this.wrapper.findAll(this.byTid(TID.text)).map((w) => w.text());
	}

	/** Raw `textContent` (NOT trimmed) — used to assert the single-space empty-line render. */
	lineRawTexts(): string[] {
		return this.wrapper.findAll(this.byTid(TID.text)).map((w) => w.element.textContent);
	}

	gutters(): string[] {
		return this.wrapper.findAll(this.byTid(TID.gutter)).map((w) => w.text());
	}

	lineTypes(): string[] {
		return this.wrapper.findAll(this.byTid(TID.line)).map((w) => w.attributes('data-line-type') ?? '');
	}

	moreExists(): boolean {
		return this.wrapper.find(this.byTid(TID.more)).exists();
	}

	/** Count of `...` separator rows between hunks (R-RR-004). */
	separatorCount(): number {
		return this.wrapper.findAll(this.byTid(TID.separator)).length;
	}

	moreText(): string {
		return this.wrapper.get(this.byTid(TID.more)).text();
	}

	html(): string {
		return this.wrapper.html();
	}
}
