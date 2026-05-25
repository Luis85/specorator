import { inject } from 'vue';
import type { ProviderCommandCatalogPort } from '@/domain/ports';
import { PROVIDER_COMMAND_CATALOG_PORT } from '@/infrastructure/bridge/ports';

/**
 * Inject the provider command/skill catalog port (SPEC-CP-026). Mirrors the
 * `useChatRuntimePort` inject-or-throw pattern (ADR-008 one-port-per-composable;
 * no aggregate). Throws a clear "was not provided" error when the host forgot to
 * `app.provide` it.
 */
export function useProviderCommandCatalogPort(): ProviderCommandCatalogPort {
	const port = inject(PROVIDER_COMMAND_CATALOG_PORT);
	if (!port) {
		throw new Error(
			'ProviderCommandCatalogPort was not provided. Call app.provide(PROVIDER_COMMAND_CATALOG_PORT, catalog) before mounting the app.',
		);
	}
	return port;
}
