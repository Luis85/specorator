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
 * Lifecycle: every `render()` call creates a fresh Obsidian `Component`
 * and registers it as the rendering scope. The returned disposer
 * `unload()`s that component, releasing any sub-renderers (mermaid
 * diagrams, code blocks with copy-buttons, dataview widgets, etc).
 * The Vue caller MUST invoke the disposer on `onBeforeUnmount` and
 * before re-rendering on prop change, otherwise long-lived listeners
 * accumulate per turn.
 */
export class ObsidianMarkdownRenderAdapter implements MarkdownRenderPort {
	constructor(private readonly app: App) {}

	async render(args: {
		markdown: string;
		container: HTMLElement;
		sourcePath?: string;
	}): Promise<() => void> {
		args.container.empty();
		const component = new Component();
		component.load();
		await MarkdownRenderer.render(
			this.app,
			args.markdown,
			args.container,
			args.sourcePath ?? '',
			component,
		);
		return () => {
			component.unload();
			args.container.empty();
		};
	}
}
