import type { VueWrapper } from '@vue/test-utils';

/** PageObject for `MarkdownBlock.vue` (SPEC-CC-019). Queries by `data-testid` only (ADR-009). */
export class MarkdownBlockPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	exists(): boolean {
		return this.wrapper.find('[data-testid="markdown-block"]').exists();
	}

	paragraphCount(): number {
		return this.wrapper.findAll('[data-testid="md-paragraph"]').length;
	}

	codeSpans(): string[] {
		return this.wrapper.findAll('[data-testid="md-code"]').map((w) => w.text());
	}

	/** Rendered heading texts (ADR-RR-002 / SPEC-RR-011 rich node kinds). */
	headings(): string[] {
		return this.wrapper.findAll('[data-testid="md-heading"]').map((w) => w.text());
	}

	/** Rendered strong (bold) span texts. */
	strongSpans(): string[] {
		return this.wrapper.findAll('[data-testid="md-strong"]').map((w) => w.text());
	}

	/** Rendered emphasis (italic) span texts. */
	emSpans(): string[] {
		return this.wrapper.findAll('[data-testid="md-em"]').map((w) => w.text());
	}

	/** Number of rendered list-item elements. */
	listItemCount(): number {
		return this.wrapper.findAll('[data-testid="md-list-item"]').length;
	}

	/** Rendered list-item texts. */
	listItems(): string[] {
		return this.wrapper.findAll('[data-testid="md-list-item"]').map((w) => w.text());
	}

	/** Rendered fenced code-block texts. */
	codeBlocks(): string[] {
		return this.wrapper.findAll('[data-testid="md-code-block"]').map((w) => w.text());
	}

	text(): string {
		return this.wrapper.get('[data-testid="markdown-block"]').text();
	}

	html(): string {
		return this.wrapper.get('[data-testid="markdown-block"]').html();
	}
}
