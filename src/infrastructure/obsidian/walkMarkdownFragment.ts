import type { MarkdownInline, MarkdownNode, SafeRenderResult } from '@/domain/ports';

/**
 * Walk an Obsidian-rendered markdown fragment (a detached element populated by
 * `MarkdownRenderer.render`) into the declarative `SafeRenderResult` DTO
 * (SPEC-RR-010/011, ADR-RR-001 §3). Reads `textContent` and tag/structure as
 * pure DATA — it never returns, references, or re-attaches the live element, so
 * NO DOM element / HTML string / DOM-injection sink reaches the UI (NFR-RR-006).
 *
 * The `SafeRenderResult.nodes` field contract is UNCHANGED; the walk emits the
 * P1 `paragraph` + the additive `heading`/`code_block`/`list` block kinds and the
 * `text`/`code`/`strong`/`em` inlines (SPEC-RR-011). Unrecognised block elements
 * degrade to a `paragraph` of their text.
 *
 * Lives under `src/infrastructure/obsidian/**` (coverage-excluded; its behaviour
 * is gated by the MANUAL leg of TEST-RR-026 / T-RR-043). Factored out of the
 * bridge so the walk logic is isolated, mirroring the P1 `reduceClaudeStream` seam.
 *
 * @param root the detached element populated by `MarkdownRenderer.render`.
 * @returns the declarative `SafeRenderResult` mirror of `root`.
 */
export function walkMarkdownFragment(root: Element): SafeRenderResult {
	const nodes: MarkdownNode[] = [];
	for (const child of Array.from(root.children)) {
		const node = blockNodeFor(child);
		if (node !== null) nodes.push(node);
	}
	return { nodes };
}

/** Element `textContent` coerced to a non-null string. */
function text(el: { textContent: string | null }): string {
	return el.textContent ?? '';
}

const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

function blockNodeFor(el: Element): MarkdownNode | null {
	const tag = el.tagName.toLowerCase();
	if (HEADING_TAGS.has(tag)) {
		return { kind: 'heading', level: headingLevel(tag), spans: inlineSpansFor(el) };
	}
	if (tag === 'pre') {
		return { kind: 'code_block', language: codeLanguage(el), value: text(el) };
	}
	if (tag === 'ul' || tag === 'ol') {
		return { kind: 'list', ordered: tag === 'ol', items: listItemsFor(el) };
	}
	if (tag === 'p') {
		return { kind: 'paragraph', spans: inlineSpansFor(el) };
	}
	// Unrecognised block element: degrade to a paragraph of its text so no content
	// is lost and the union stays declarative.
	const value = text(el);
	return value === '' ? null : { kind: 'paragraph', spans: [{ kind: 'text', value }] };
}

function headingLevel(tag: string): 1 | 2 | 3 | 4 | 5 | 6 {
	const n = Number(tag.slice(1));
	return n >= 1 && n <= 6 ? (n as 1 | 2 | 3 | 4 | 5 | 6) : 1;
}

function codeLanguage(pre: Element): string | undefined {
	const code = pre.querySelector('code');
	const match = code?.className.match(/language-(\w+)/);
	return match?.[1];
}

function listItemsFor(list: Element): MarkdownNode[][] {
	const items: MarkdownNode[][] = [];
	for (const li of Array.from(list.children)) {
		if (li.tagName.toLowerCase() !== 'li') continue;
		items.push([{ kind: 'paragraph', spans: inlineSpansFor(li) }]);
	}
	return items;
}

/** Map an inline child element to its `MarkdownInline` span (or `null` to skip). */
function inlineSpanForElement(child: Element): MarkdownInline | null {
	const tag = child.tagName.toLowerCase();
	if (tag === 'code') return { kind: 'code', value: text(child) };
	if (tag === 'strong' || tag === 'b') return { kind: 'strong', spans: inlineSpansFor(child) };
	if (tag === 'em' || tag === 'i') return { kind: 'em', spans: inlineSpansFor(child) };
	const value = text(child);
	return value === '' ? null : { kind: 'text', value };
}

/**
 * Walk an element's inline children into ordered `MarkdownInline` spans. Reads
 * text and recognises `<code>`/`<strong>`/`<b>`/`<em>`/`<i>`; everything else
 * contributes its text verbatim (no HTML, NFR-RR-006).
 */
function inlineSpansFor(el: Element): MarkdownInline[] {
	const spans: MarkdownInline[] = [];
	for (const node of Array.from(el.childNodes)) {
		if (node.nodeType === node.TEXT_NODE) {
			const value = text(node);
			if (value !== '') spans.push({ kind: 'text', value });
			continue;
		}
		if (node.nodeType !== node.ELEMENT_NODE) continue;
		const span = inlineSpanForElement(node as Element);
		if (span !== null) spans.push(span);
	}
	return spans;
}
