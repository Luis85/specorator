import { inject } from 'vue';
import type { SelectionSourcePort } from '@/domain/ports';
import { SELECTION_SOURCE_PORT } from '@/infrastructure/bridge/ports';

/**
 * Inject the selection-capture port (SPEC-CA-025). Mirrors the `useVaultPort`
 * inject-or-throw pattern (ADR-008 one-port-per-composable, no aggregate). Throws
 * a clear "was not provided" error when the host forgot to `app.provide` it.
 */
export function useSelectionSourcePort(): SelectionSourcePort {
	const port = inject(SELECTION_SOURCE_PORT);
	if (!port) {
		throw new Error(
			'SelectionSourcePort was not provided. Call app.provide(SELECTION_SOURCE_PORT, port) before mounting the app.',
		);
	}
	return port;
}
