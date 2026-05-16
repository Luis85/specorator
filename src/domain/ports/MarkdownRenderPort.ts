/**
 * Narrow port for native markdown rendering (top-1 gap from the
 * agent-sidepanel-v2 comparative review). When provided by the host, the
 * Vue `MarkdownBlock` component delegates rendering to the port —
 * unlocking GFM tables, syntax-highlighted code blocks, math, wikilinks,
 * image embeds, and mermaid. When NOT provided (tests, GitHub Pages
 * demo), the component falls back to a hand-rolled VNode parser that
 * covers the markdown subset Claudian's plain blocks need.
 *
 * The Obsidian implementation wraps `MarkdownRenderer.render`. It
 * requires an Obsidian `Component` instance per render call to scope
 * the renderer's internal disposables; the Vue component owns that
 * lifecycle. Domain layer purposely stays free of `obsidian` imports —
 * the adapter lives in `src/infrastructure/obsidian/`.
 */
export interface MarkdownRenderPort {
	/**
	 * Render `markdown` into `container`. Implementations must clear any
	 * prior content and append fresh DOM. Output is XSS-safe by
	 * construction (Obsidian's renderer escapes user input).
	 *
	 * `sourcePath` is the vault path the content is "anchored at" — used
	 * by Obsidian's link resolver for relative wikilink targets.
	 * Implementations that don't resolve links may ignore it.
	 *
	 * Returns a disposer that the caller invokes when the rendered DOM
	 * leaves the document (component unmount, content replace). The
	 * disposer cleans up any lifecycle hooks the renderer attached to
	 * the container's children — load-bearing for Obsidian's
	 * `MarkdownRenderer.render`, which registers child `Component`s.
	 */
	render(args: {
		markdown: string;
		container: HTMLElement;
		sourcePath?: string;
	}): Promise<() => void>;
}
