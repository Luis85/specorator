import { inject } from 'vue';
import type { ChatRuntimePort } from '@/domain/ports';
import { CHAT_RUNTIME_PORT } from '@/infrastructure/bridge/ports';

/**
 * Inject the chat runtime port (SPEC-CC-017). Mirrors the `useLoggerPort`
 * inject-or-throw pattern (ADR-008 one-port-per-composable). Throws a clear
 * "was not provided" error when the host forgot to `app.provide` it.
 */
export function useChatRuntimePort(): ChatRuntimePort {
	const port = inject(CHAT_RUNTIME_PORT);
	if (!port) {
		throw new Error(
			'ChatRuntimePort was not provided. Call app.provide(CHAT_RUNTIME_PORT, runtime) before mounting the app.',
		);
	}
	return port;
}
