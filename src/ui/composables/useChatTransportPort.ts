import { inject } from 'vue';
import type { ChatTransportPort } from '@/domain/ports';
import { CHAT_TRANSPORT_PORT } from '@/infrastructure/bridge/ports';

/**
 * Vue composable that pulls the active {@link ChatTransportPort}
 * implementation out of the host's dependency-injection container.
 *
 * Renamed in WS-1 (ADR-MPS-001). The legacy import path under the
 * old Claude-CLI module name continues to work for one release via a
 * deprecated re-export shim; new code must import from this module.
 */
export function useChatTransportPort(): ChatTransportPort | undefined {
	return inject(CHAT_TRANSPORT_PORT);
}
