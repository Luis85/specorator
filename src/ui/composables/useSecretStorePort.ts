import { inject } from 'vue'
import type { SecretStorePort } from '@/domain/ports'
import { SECRET_STORE_PORT } from '@/infrastructure/bridge/ports'

/**
 * Stub used when no `SecretStorePort` was provided — the consumer is running
 * outside an Obsidian context (e.g. a UI unit test without explicit wiring).
 * Mirrors the unavailable-backend semantics: `getSecret` returns `null` and
 * `setSecret` is a no-op, so consumers fall through to the degraded branch
 * instead of throwing.
 */
const UNAVAILABLE_STUB: SecretStorePort = {
	available: false,
	getSecret: () => Promise.resolve(null),
	setSecret: () => Promise.resolve(),
}

export function useSecretStorePort(): SecretStorePort {
	return inject(SECRET_STORE_PORT, UNAVAILABLE_STUB)
}
