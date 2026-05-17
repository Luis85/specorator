import type { MarkdownRenderPort } from '@/domain/ports/MarkdownRenderPort';
import { renderMarkdownInto } from '@/ui/components/agent/internal/markdown-parser';

/**
 * In-memory `MarkdownRenderPort` used in unit tests and `npm run dev`
 * (WP-4 markdown hardening). Delegates to the pure parser extracted from
 * the old `MarkdownBlock.vue` so consumers get the same paragraph / code
 * fence / list / blockquote / inline markup the SFC used to render. The
 * adapter writes real DOM nodes into the caller's container (no
 * `innerHTML`) and returns a disposer that detaches the wrapper.
 */
export class MockMarkdownRenderPort implements MarkdownRenderPort {
	async render(args: {
		markdown: string;
		container: HTMLElement;
		sourcePath?: string;
	}): Promise<() => void> {
		return renderMarkdownInto({ source: args.markdown, container: args.container });
	}
}
