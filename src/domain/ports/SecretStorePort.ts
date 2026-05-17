/**
 * Narrow port for OS-level secret storage (ADR-008).
 *
 * Production implementation wraps Obsidian's `App.secretStorage` (available
 * since desktop 1.11.4, 2026-01-07) which persists secrets in the OS keychain
 * and explicitly OPTS OUT of Obsidian Sync. This is the only correct home for
 * the Anthropic API key — `PluginSettings` ships with Obsidian Sync, leaking
 * the key across the user's devices.
 *
 * `available` is `false` on mobile (where `app.secretStorage` is `undefined`)
 * and on desktop builds older than 1.11.4. Consumers must check this flag and
 * fall back to a "key not stored on this device" state rather than throwing.
 */
export interface SecretStorePort {
	/**
	 * `true` when the underlying secret-storage backend is reachable. Mobile
	 * Obsidian and pre-1.11.4 desktop builds return `false`; the localstorage
	 * (GitHub Pages) bridge also returns `false`.
	 */
	readonly available: boolean

	/**
	 * Retrieve a previously-stored secret by id. Returns `null` when the secret
	 * is unset or the backend is unavailable.
	 */
	getSecret(id: string): Promise<string | null>

	/**
	 * Persist a secret under the given id. No-op when `available === false`.
	 * Implementations MUST NOT throw on the unavailable path.
	 */
	setSecret(id: string, secret: string): Promise<void>
}

/**
 * Canonical identifier for the Anthropic API key. Keep all consumers using
 * this constant so a future rename is a one-edit change.
 *
 * Obsidian's `App.secretStorage` validates IDs to lowercase alphanumeric
 * with optional dashes — the previous dot-delimited / camelCase form was
 * rejected at `setSecret()` time, so settings writes never persisted on
 * desktop builds where secret storage was available.
 */
export const SECRET_ID_ANTHROPIC = 'specorator-anthropic-apikey'
