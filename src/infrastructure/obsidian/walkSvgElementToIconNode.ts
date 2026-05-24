import type { IconNode } from '@/domain/ports';

/**
 * Walk a rendered SVG `Element` subtree into a declarative `IconNode` tree
 * (SPEC-RR-012, ADR-RR-001 §4). Reads `tagName`, attributes, and children as
 * pure DATA — it never returns, references, or re-attaches the live element, so
 * NO DOM-injection sink reaches the UI (NFR-RR-006). The caller (`ObsidianBridge.
 * createIconPort`) builds the element via Obsidian `setIcon` into a detached
 * node, walks it here, then discards the element.
 *
 * Lives under `src/infrastructure/obsidian/**` (coverage-excluded; its behaviour
 * is gated by the MANUAL leg of TEST-RR-026 / T-RR-043). Factored out of the
 * bridge so the walk logic is isolated and pure, mirroring the P1
 * `reduceClaudeStream` seam.
 *
 * @param el the rendered `<svg>` element (or any element) to capture as data.
 * @returns the declarative `IconNode` mirror of `el`.
 */
export function walkSvgElementToIconNode(el: Element): IconNode {
	const attrs: Record<string, string> = {};
	for (const attr of Array.from(el.attributes)) {
		attrs[attr.name] = attr.value;
	}
	const children: IconNode[] = [];
	for (const child of Array.from(el.children)) {
		children.push(walkSvgElementToIconNode(child));
	}
	return { tag: el.tagName.toLowerCase(), attrs, children };
}
