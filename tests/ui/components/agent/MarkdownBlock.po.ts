import type { VueWrapper } from '@vue/test-utils';

/**
 * Page object for `MarkdownBlock.vue` (PR-ASV-7). Tests assert on rendered
 * element types and (escaped) text content — selectors are tag-based because
 * the markdown component renders structural HTML rather than carrying
 * `data-testid` on every emitted node. The wrapper root carries the only
 * `data-testid` (`agent-markdown-block`) and all other queries are scoped to
 * descendants of that root.
 */
export class MarkdownBlockPO {
	constructor(private readonly wrapper: VueWrapper) {}

	get root() {
		return this.wrapper.find('[data-testid="agent-markdown-block"]');
	}

	paragraphs() {
		return this.root.findAll('p');
	}

	strongs() {
		return this.root.findAll('strong');
	}

	ems() {
		return this.root.findAll('em');
	}

	inlineCodes() {
		// `pre > code` is the fenced-block path; bare `code` (not inside `pre`)
		// is inline.
		return this.root.findAll('code').filter((c) => c.element.parentElement?.tagName !== 'PRE');
	}

	codeBlocks() {
		return this.root.findAll('pre');
	}

	links() {
		return this.root.findAll('a');
	}

	lists() {
		return this.root.findAll('ul, ol');
	}

	unorderedLists() {
		return this.root.findAll('ul');
	}

	orderedLists() {
		return this.root.findAll('ol');
	}

	listItems() {
		return this.root.findAll('li');
	}

	blockquotes() {
		return this.root.findAll('blockquote');
	}

	/**
	 * Returns the raw rendered HTML of the markdown root. Used by safety tests
	 * to assert that angle brackets in user input survive as `&lt;` / `&gt;`
	 * entities rather than being injected as live tags.
	 */
	html() {
		return this.root.html();
	}
}
