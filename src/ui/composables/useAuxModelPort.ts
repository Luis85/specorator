import { inject } from 'vue';
import type { AuxModelPort } from '@/domain/ports';
import { AUX_MODEL_PORT } from '@/infrastructure/bridge/ports';

/**
 * Inject the cold-start auxiliary-model port (SPEC-CA-025). Mirrors the
 * `useVaultPort` inject-or-throw pattern (ADR-008 one-port-per-composable, no
 * aggregate). Throws a clear "was not provided" error when the host forgot to
 * `app.provide` it.
 */
export function useAuxModelPort(): AuxModelPort {
	const port = inject(AUX_MODEL_PORT);
	if (!port) {
		throw new Error(
			'AuxModelPort was not provided. Call app.provide(AUX_MODEL_PORT, port) before mounting the app.',
		);
	}
	return port;
}
