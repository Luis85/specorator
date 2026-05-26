import { inject } from 'vue';
import type { ProviderRegistryPort } from '@/domain/ports';
import { PROVIDER_REGISTRY_PORT } from '@/infrastructure/bridge/ports';

/**
 * Inject the provider-registry port (SPEC-PV-019, P9). Mirrors the
 * `useVaultPort`/`useToolbarCatalogPort` inject-or-throw pattern (ADR-008
 * one-port-per-composable, no aggregate, REQ-PV-112). Throws a clear "was not
 * provided" error when the host forgot to `app.provide` it.
 *
 * Consumers that can degrade without the registry inject the key OPTIONALLY
 * (`inject(PROVIDER_REGISTRY_PORT, undefined)`) — a Claude-only / no-registry mount
 * stays byte-identical to P8 (NFR-PV-001); this strict composable exists for any
 * consumer that requires the port.
 */
export function useProviderRegistryPort(): ProviderRegistryPort {
	const port = inject(PROVIDER_REGISTRY_PORT);
	if (!port) {
		throw new Error(
			'ProviderRegistryPort was not provided. Call app.provide(PROVIDER_REGISTRY_PORT, port) before mounting the app.',
		);
	}
	return port;
}
