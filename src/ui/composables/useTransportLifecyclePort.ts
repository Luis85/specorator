import { inject } from 'vue'
import type { TransportLifecyclePort } from '@/domain/ports'
import { TRANSPORT_LIFECYCLE_PORT } from '@/infrastructure/bridge/ports'

/**
 * Per-port composable for the streaming-transport lifecycle (ADR-008).
 * Split off `useClaudeCliPort` in WP-12 — consumers that only need to
 * `startup()` or `shutdown()` no longer have to depend on the streaming
 * port.
 *
 * Returns `undefined` when no `TransportLifecyclePort` is provided
 * (standalone web demo, unit tests without lifecycle wiring).
 */
export function useTransportLifecyclePort(): TransportLifecyclePort | undefined {
	return inject(TRANSPORT_LIFECYCLE_PORT)
}
