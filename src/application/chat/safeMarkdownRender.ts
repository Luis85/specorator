import type { MarkdownInline, MarkdownNode, SafeRenderResult } from '@/domain/ports';

/**
 * The pure P1 backing of `MarkdownRenderPort` (SPEC-CC-014, CLAR-CC-005).
 *
 * Total, synchronous, idempotent transform from a raw markdown string to the structured
 * `SafeRenderResult` DTO that `MarkdownBlock.vue` renders DECLARATIVELY (no `v-html`/`innerHTML`,
 * NFR-CC-008). Only three constructs are recognised in P1 — paragraphs (split on blank lines),
 * inline `` `code` `` spans, and a single `\n` line break inside a paragraph. Everything else
 * (`<`, `&`, `*`, `_`, `#`, links …) is carried verbatim as literal `text` — there is NO HTML in
 * any output field and the function NEVER throws. P2 re-backs the port with Obsidian's renderer
 * without changing this shape.
 *
 * @see SPEC-CC-014, REQ-CC-006, NFR-CC-008, EC-14
 */
export function safeMarkdownRender(markdown: string): SafeRenderResult {
	// Empty / whitespace-only input renders nothing (EC-5 finalise-empty, EC-14).
	if (markdown.trim() === '') {
		return { nodes: [] };
	}

	// Paragraphs are separated by one-or-more blank lines (a line that is empty or whitespace).
	const blocks = markdown.split(/\n[ \t]*\n+/);
	const nodes: MarkdownNode[] = [];

	for (const block of blocks) {
		// A block that is only whitespace contributes no paragraph.
		if (block.trim() === '') continue;
		nodes.push({ kind: 'paragraph', spans: parseInlineSpans(block) });
	}

	return { nodes };
}

/**
 * Split a paragraph's text into ordered inline spans, recognising balanced inline-code runs
 * (`` `...` ``). An UNBALANCED trailing backtick is treated as a literal text character (EC-14) —
 * the scan never throws and never emits an HTML value.
 */
function parseInlineSpans(block: string): MarkdownInline[] {
	const spans: MarkdownInline[] = [];
	let textBuffer = '';

	const flushText = (): void => {
		if (textBuffer !== '') {
			spans.push({ kind: 'text', value: textBuffer });
			textBuffer = '';
		}
	};

	let index = 0;
	while (index < block.length) {
		const char = block[index];
		if (char === '`') {
			const closing = block.indexOf('`', index + 1);
			if (closing === -1) {
				// Unbalanced backtick: carry the rest of the block as literal text.
				textBuffer += block.slice(index);
				break;
			}
			flushText();
			spans.push({ kind: 'code', value: block.slice(index + 1, closing) });
			index = closing + 1;
			continue;
		}
		textBuffer += char;
		index += 1;
	}

	flushText();
	return spans;
}
