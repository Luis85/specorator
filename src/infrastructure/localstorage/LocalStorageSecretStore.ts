import type { SecretStorePort } from '@/domain/ports/SecretStorePort'

/**
 * Browser-only {@link SecretStorePort} for the GitHub Pages demo. There is no
 * OS keychain in the browser, so `available` is `false` and both operations
 * are no-ops. The chat-degraded "key not stored on this device" branch fires
 * unconditionally on the demo.
 */
export class LocalStorageSecretStore implements SecretStorePort {
	public readonly available = false

	async getSecret(_id: string): Promise<string | null> {
		return null
	}

	async setSecret(_id: string, _secret: string): Promise<void> {
		// No-op: persisting a key in localStorage would be insecure (XSS-readable)
		// and the GitHub Pages demo intentionally cannot make real API calls.
	}
}
