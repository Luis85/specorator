import type { MarkdownRenderPort, SafeRenderResult } from '@/domain/ports';
import { safeMarkdownRender } from './safeMarkdownRender';

/**
 * P1 `MarkdownRenderPort` implementation (SPEC-CC-015, SPEC-CC-007).
 *
 * Delegates `render` to the pure `safeMarkdownRender` transform (SPEC-CC-014) — the seam P2
 * re-backs with Obsidian's `MarkdownRenderer.render` without changing the port shape. This is
 * the object the three bridges return from `createMarkdownRenderPort()` (SPEC-CC-013); P1
 * behaviour is identical across bridges.
 *
 * Stateless and pure, so a single shared singleton (`safeMarkdownRenderPort`) is safe to reuse.
 */
class SafeMarkdownRenderPort implements MarkdownRenderPort {
	render(markdown: string): SafeRenderResult {
		return safeMarkdownRender(markdown);
	}
}

/** Shared, stateless P1 markdown render port backed by `safeMarkdownRender`. */
export const safeMarkdownRenderPort: MarkdownRenderPort = new SafeMarkdownRenderPort();
