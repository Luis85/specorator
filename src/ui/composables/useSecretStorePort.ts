import { inject } from 'vue';
import type { SecretStorePort } from '@/domain/ports';
import { SECRET_STORE_PORT } from '@/infrastructure/bridge/ports';

/**
 * Inject the native secret-store port (SPEC-PV-019, P9). Mirrors the
 * `useVaultPort` inject-or-throw pattern (ADR-008 one-port-per-composable, no
 * aggregate, REQ-PV-112). Throws a clear "was not provided" error when the host
 * forgot to `app.provide` it.
 *
 * The masked secret field reads `isAvailable()` + emits `save`; the wiring calls
 * `setSecret(providerSecretKey(id), value)` — the value never crosses back into the
 * UI/store/DTO (NFR-PV-002). Consumers that can degrade inject the key OPTIONALLY.
 */
export function useSecretStorePort(): SecretStorePort {
	const port = inject(SECRET_STORE_PORT);
	if (!port) {
		throw new Error(
			'SecretStorePort was not provided. Call app.provide(SECRET_STORE_PORT, port) before mounting the app.',
		);
	}
	return port;
}
