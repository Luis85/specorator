import { inject } from 'vue';
import type { MarkdownRenderPort } from '@/domain/ports';
import { MARKDOWN_RENDER_PORT } from '@/infrastructure/bridge/ports';

/**
 * Inject the markdown render port (SPEC-CC-017). Mirrors the `useLoggerPort`
 * inject-or-throw pattern (ADR-008 one-port-per-composable). Throws a clear
 * "was not provided" error when the host forgot to `app.provide` it.
 */
export function useMarkdownRenderPort(): MarkdownRenderPort {
	const port = inject(MARKDOWN_RENDER_PORT);
	if (!port) {
		throw new Error(
			'MarkdownRenderPort was not provided. Call app.provide(MARKDOWN_RENDER_PORT, port) before mounting the app.',
		);
	}
	return port;
}
