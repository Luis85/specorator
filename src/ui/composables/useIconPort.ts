import { inject } from 'vue';
import type { IconPort } from '@/domain/ports';
import { ICON_PORT } from '@/infrastructure/bridge/ports';

/**
 * Inject the icon port (SPEC-RR-021). Mirrors the `useChatRuntimePort` /
 * `useMarkdownRenderPort` inject-or-throw pattern (ADR-008 one-port-per-
 * composable). Throws a clear "was not provided" error when the host forgot to
 * `app.provide` it.
 */
export function useIconPort(): IconPort {
	const port = inject(ICON_PORT);
	if (!port) {
		throw new Error(
			'IconPort was not provided. Call app.provide(ICON_PORT, iconPort) before mounting the app.',
		);
	}
	return port;
}
