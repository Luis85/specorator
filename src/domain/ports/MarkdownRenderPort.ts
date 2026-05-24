/**
 * Safe markdown -> structured-nodes seam (SPEC-CC-007, CLAR-CC-005; widened
 * additively in SPEC-RR-011).
 *
 * The port returns **structured nodes** (a DTO), never an HTML string or a DOM-injection
 * sink, so the Vue layer renders declaratively (no `v-html`/`innerHTML`, NFR-CC-008/
 * NFR-RR-006). P1 backing = `safeMarkdownRender` (SPEC-CC-014); P2 re-backs `render` on
 * the Obsidian bridge with Obsidian's `MarkdownRenderer.render` walked into this DTO —
 * the `SafeRenderResult.nodes` field contract is UNCHANGED (ADR-RR-001 §3).
 *
 * P2 widens the unions ADDITIVELY: the P1 `paragraph` node + `text`/`code` inlines
 * survive byte-identical; P2 adds the declarative block kinds richer markdown (thinking
 * / subagent / Obsidian-rendered content) needs. The pure `safeMarkdownRender` backing
 * (Mock/LocalStorage) MAY emit only the P1 subset — the extension is opt-in by the
 * Obsidian backing.
 */

/** Inline span inside a block node. */
export type MarkdownInline =
	| { kind: 'text'; value: string }
	| { kind: 'code'; value: string } // inline `code`
	| { kind: 'strong'; spans: MarkdownInline[] } // P2 additive (SPEC-RR-011)
	| { kind: 'em'; spans: MarkdownInline[] }; // P2 additive (SPEC-RR-011)

/**
 * Block-level node. P1 supports paragraphs only (separated by blank lines); P2 adds
 * `heading`/`code_block`/`list` additively. `code_block.value` is raw text rendered as
 * `<pre><code>{{ value }}</code></pre>` (escaped by Vue interpolation, NFR-RR-006); list
 * items are nested `MarkdownNode[]`.
 */
export type MarkdownNode =
	// P1 — a hard line break inside a paragraph is a {kind:'text'} with '\n'.
	| { kind: 'paragraph'; spans: MarkdownInline[] }
	// P2 additive (SPEC-RR-011).
	| { kind: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; spans: MarkdownInline[] }
	| { kind: 'code_block'; language?: string; value: string }
	| { kind: 'list'; ordered: boolean; items: MarkdownNode[][] };

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
