/**
 * Safe markdown -> structured-nodes seam (SPEC-CC-007, CLAR-CC-005).
 *
 * The port returns **structured nodes** (a DTO), never an HTML string or a DOM-injection
 * sink, so the Vue layer renders declaratively (no `v-html`/`innerHTML`, NFR-CC-008).
 * P1 backing = `safeMarkdownRender` (SPEC-CC-014); P2 re-backs `render` with Obsidian's
 * `MarkdownRenderer.render` without changing this shape.
 */

/** Inline span inside a paragraph. */
export type MarkdownInline = { kind: 'text'; value: string } | { kind: 'code'; value: string }; // inline `code`

/** Block-level node. P1 supports paragraphs only (separated by blank lines). */
export interface MarkdownNode {
	kind: 'paragraph';
	/** ordered inline spans; a hard line break inside a paragraph is a {kind:'text'} with '\n'. */
	spans: MarkdownInline[];
}

export interface SafeRenderResult {
	nodes: MarkdownNode[];
}

/**
 * One-method safe markdown -> structured-nodes seam. `render` is pure, synchronous, total
 * (never throws), and idempotent — safe to call on every accumulated `text` chunk during
 * streaming (REQ-CC-004). The result is a DTO consumed declaratively by `MarkdownBlock.vue`,
 * never injected as HTML.
 */
export interface MarkdownRenderPort {
	render(markdown: string): SafeRenderResult;
}
