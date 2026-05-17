import type { SecretStorePort } from '@/domain/ports/SecretStorePort'

/**
 * In-memory {@link SecretStorePort} for unit tests and the standalone
 * browser dev mode. Mirrors the production keychain semantics: secrets are
 * keyed by string id, and `setSecret` overwrites prior values.
 *
 * `available` is `true` so tests exercise the same branch as production
 * desktop. Tests that specifically need the unavailable branch can construct
 * with `{ available: false }`.
 */
export class MockSecretStore implements SecretStorePort {
	private readonly _secrets = new Map<string, string>()
	public readonly available: boolean

	constructor(opts: { available?: boolean; initial?: Record<string, string> } = {}) {
		this.available = opts.available ?? true
		if (opts.initial !== undefined) {
			for (const [id, value] of Object.entries(opts.initial)) {
				this._secrets.set(id, value)
			}
		}
	}

	async getSecret(id: string): Promise<string | null> {
		if (!this.available) return null
		return this._secrets.has(id) ? (this._secrets.get(id) ?? null) : null
	}

	async setSecret(id: string, secret: string): Promise<void> {
		if (!this.available) return
		this._secrets.set(id, secret)
	}

	/** Test helper: inspect every secret currently held. */
	snapshot(): Record<string, string> {
		return Object.fromEntries(this._secrets.entries())
	}
}
