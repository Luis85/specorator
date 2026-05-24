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

	text(): string {
		return this.wrapper.get('[data-testid="markdown-block"]').text();
	}

	html(): string {
		return this.wrapper.get('[data-testid="markdown-block"]').html();
	}
}
