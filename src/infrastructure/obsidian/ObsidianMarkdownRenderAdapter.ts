import { Component, MarkdownRenderer, type App } from 'obsidian';
import type { MarkdownRenderPort } from '@/domain/ports/MarkdownRenderPort';

/**
 * Obsidian-backed `MarkdownRenderPort` implementation (top-1 gap from
 * the agent-sidepanel-v2 comparative review). Delegates to Obsidian's
 * native `MarkdownRenderer.render(app, markdown, container, sourcePath,
 * component)`, which gives us GFM tables, code syntax highlighting,
 * math (`$...$` / `$$...$$`), wikilinks, image embeds, and mermaid for
 * free — anything Obsidian itself renders.
 *
 * Render isolation (Codex P1 on PR #377): each `render()` call appends
 * its own private child div ("scratch") into the caller's container
 * after evicting any existing scratch children. The disposer removes
 * ONLY this render's scratch div (not the whole container) and unloads
 * its component. With this contract, a stale render's late-arriving
 * disposer cannot blank a newer render's already-painted output.
 *
 * Component cleanup on failure (Codex P2 on PR #377): if
 * `MarkdownRenderer.render` rejects, the catch branch unloads the
 * component AND removes the scratch div before re-throwing, so failed
 * renders don't leak post-processor listeners.
 */
export class ObsidianMarkdownRenderAdapter implements MarkdownRenderPort {
	constructor(private readonly app: App) {}

	async render(args: {
		markdown: string;
		container: HTMLElement;
		sourcePath?: string;
	}): Promise<() => void> {
		// Evict any prior scratch children so successive renders don't
		// stack. We tag scratch divs with a dataset attribute so unrelated
		// children (none today) survive a render-cycle reset.
		// Duck-typed `HTMLElement` check (the Obsidian lint rule blocks
		// `instanceof HTMLElement` because it isn't cross-window safe):
		// every relevant child here is created by `createDiv()` and so is
		// guaranteed to be an `HTMLElement`; the dataset check below is
		// the actual identification.
		for (const prior of Array.from(args.container.children)) {
			const el = prior as HTMLElement;
			if (el.dataset.specoratorMarkdownScratch === '1') {
				el.remove();
			}
		}
		const scratch = args.container.createDiv({
			cls: 'sp-markdown-scratch',
		});
		scratch.dataset.specoratorMarkdownScratch = '1';
		const component = new Component();
		component.load();
		try {
			await MarkdownRenderer.render(
				this.app,
				args.markdown,
				scratch,
				args.sourcePath ?? '',
				component,
			);
		} catch (err: unknown) {
			component.unload();
			scratch.remove();
			throw err;
		}
		return () => {
			component.unload();
			// Disposer removes ONLY this render's scratch div, leaving any
			// newer render's scratch untouched. `remove()` is a no-op if
			// the node was already detached (defence in depth).
			scratch.remove();
		};
	}
}
