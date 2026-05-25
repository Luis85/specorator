import { inject } from 'vue';
import type { ProviderHistoryPort } from '@/domain/ports';
import { PROVIDER_HISTORY_PORT } from '@/infrastructure/bridge/ports';

/**
 * Inject the provider-history port (SPEC-TS-021). Mirrors the
 * `useChatRuntimePort` inject-or-throw pattern (ADR-008 one-port-per-composable;
 * no aggregate). Throws a clear "was not provided" error when the host forgot to
 * `app.provide` it.
 */
export function useProviderHistoryPort(): ProviderHistoryPort {
	const port = inject(PROVIDER_HISTORY_PORT);
	if (!port) {
		throw new Error(
			'ProviderHistoryPort was not provided. Call app.provide(PROVIDER_HISTORY_PORT, history) before mounting the app.',
		);
	}
	return port;
}
