import { inject } from 'vue';
import type { SelectionHighlightPort } from '@/domain/ports';
import { SELECTION_HIGHLIGHT_PORT } from '@/infrastructure/bridge/ports';

/**
 * Inject the selection-highlight (paint) port (SPEC-CA-025). Mirrors the
 * `useVaultPort` inject-or-throw pattern (ADR-008 one-port-per-composable, no
 * aggregate). Throws a clear "was not provided" error when the host forgot to
 * `app.provide` it.
 */
export function useSelectionHighlightPort(): SelectionHighlightPort {
	const port = inject(SELECTION_HIGHLIGHT_PORT);
	if (!port) {
		throw new Error(
			'SelectionHighlightPort was not provided. Call app.provide(SELECTION_HIGHLIGHT_PORT, port) before mounting the app.',
		);
	}
	return port;
}
