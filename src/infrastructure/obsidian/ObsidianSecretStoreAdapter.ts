import type { App } from 'obsidian'
import type { SecretStorePort } from '@/domain/ports/SecretStorePort'

/**
 * Production implementation of {@link SecretStorePort} backed by Obsidian's
 * `App.secretStorage` (available since Obsidian desktop 1.11.4, 2026-01-07).
 *
 * Why this exists: `PluginSettings` is mirrored by Obsidian Sync across the
 * user's devices, which is the wrong place for an Anthropic API key. The
 * native `secretStorage` API persists in the OS keychain and is explicitly
 * NOT synced.
 *
 * Mobile + pre-1.11.4 desktop: `app.secretStorage` is `undefined`, so
 * {@link available} is `false`. `getSecret` returns `null` and `setSecret`
 * is a no-op on those builds — consumers must check `available` and surface
 * the missing-key fallback instead of failing hard.
 */
interface SecretStorageLike {
	getSecret(id: string): Promise<string | null>
	setSecret(id: string, secret: string): Promise<void>
	listSecrets?(): Promise<string[]>
}

type AppWithSecretStorage = App & { secretStorage?: SecretStorageLike }

export class ObsidianSecretStoreAdapter implements SecretStorePort {
	private readonly _secretStorage: SecretStorageLike | undefined

	constructor(app: App) {
		this._secretStorage = (app as AppWithSecretStorage).secretStorage
	}

	get available(): boolean {
		return typeof this._secretStorage?.getSecret === 'function'
	}

	async getSecret(id: string): Promise<string | null> {
		if (this._secretStorage === undefined) return null
		return this._secretStorage.getSecret(id)
	}

	async setSecret(id: string, secret: string): Promise<void> {
		if (this._secretStorage === undefined) return
		await this._secretStorage.setSecret(id, secret)
	}
}
