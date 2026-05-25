import { inject } from 'vue';
import type { ToolbarCatalogPort } from '@/domain/ports';
import { TOOLBAR_CATALOG_PORT } from '@/infrastructure/bridge/ports';

/**
 * Inject the toolbar option-catalog port (SPEC-TC-024, P6). Mirrors the
 * `useVaultPort`/`useAuxModelPort` inject-or-throw pattern (ADR-008
 * one-port-per-composable, no aggregate). Throws a clear "was not provided"
 * error when the host forgot to `app.provide` it.
 *
 * `ChatSurface` injects the key OPTIONALLY (`inject(TOOLBAR_CATALOG_PORT,
 * undefined)`) so a mount without it degrades to "no toolbar"; this strict
 * composable exists for any consumer that requires the port.
 */
export function useToolbarCatalogPort(): ToolbarCatalogPort {
	const port = inject(TOOLBAR_CATALOG_PORT);
	if (!port) {
		throw new Error(
			'ToolbarCatalogPort was not provided. Call app.provide(TOOLBAR_CATALOG_PORT, port) before mounting the app.',
		);
	}
	return port;
}
