/**
 * Narrow icon seam (SPEC-RR-009, ADR-RR-001 §4). The P0-deleted icon port
 * (ADR-PSR-001) regrows here as its first P2 consumer. The port returns a
 * declarative DTO — NEVER a DOM mutator (NFR-RR-006).
 */

/**
 * Declarative icon node. The render layer (`SpIcon.vue`) walks this tree into
 * Vue VNodes; NO DOM-injection sink (no `innerHTML`/`setIcon`) reaches the UI.
 * Mirrors the SVG shape an Obsidian/Lucide icon produces, captured as data.
 */
export interface IconNode {
	/** SVG tag name, e.g. 'svg' | 'path' | 'circle' | 'line' | 'polyline'. */
	tag: string;
	/** Plain string attributes (e.g. { d: 'M…', 'stroke-width': '2', viewBox: '0 0 24 24' }). */
	attrs: Record<string, string>;
	/** Ordered child nodes (the SVG path/shape tree). */
	children: IconNode[];
}

/**
 * One-method narrow icon seam (ADR-008 — one port, one consumer). `setIcon`
 * resolves a logical icon name (e.g. 'check', 'x', 'shield-off', 'dot', tool
 * icon names) to a declarative `IconNode`, or `null` when the name is unknown
 * (the caller falls back to a generic icon). Pure, synchronous, total,
 * idempotent; never throws.
 */
export interface IconPort {
	setIcon(name: string): IconNode | null;
}
