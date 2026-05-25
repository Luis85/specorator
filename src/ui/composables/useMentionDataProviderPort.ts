import { inject } from 'vue';
import type { MentionDataProviderPort } from '@/domain/ports';
import { MENTION_DATA_PROVIDER_PORT } from '@/infrastructure/bridge/ports';

/**
 * Inject the mention data-provider port (SPEC-CP-026). Mirrors the
 * `useChatRuntimePort` inject-or-throw pattern (ADR-008 one-port-per-composable;
 * no aggregate). Throws a clear "was not provided" error when the host forgot to
 * `app.provide` it.
 */
export function useMentionDataProviderPort(): MentionDataProviderPort {
	const port = inject(MENTION_DATA_PROVIDER_PORT);
	if (!port) {
		throw new Error(
			'MentionDataProviderPort was not provided. Call app.provide(MENTION_DATA_PROVIDER_PORT, provider) before mounting the app.',
		);
	}
	return port;
}
