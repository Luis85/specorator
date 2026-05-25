/**
 * Domain-level plugin configuration. Persisted via `SettingsPort` (device-local
 * store, ADR-PSR-002) and read by the i18n seam + logger filter.
 *
 * P0 reboot (ADR-PSR-001, SPEC-PSR-001): reduced to the two device-scoped
 * fields with a live consumer — `locale` (i18n) and `logLevel` (LoggerPort
 * filter). P3 threads-sessions (SPEC-TS-005) grows it additively with
 * `sessionsFolder` + `maxTabs` — both device-local *preferences about*
 * persistence, never transcript content (NFR-TS-013). No `@/domain/chat` import.
 */
export interface PluginSettings {
	readonly locale: string
	readonly logLevel: 'debug' | 'info' | 'warn' | 'error'
	// ---- P3 threads-sessions (SPEC-TS-005) ----
	/** Vault folder holding ConversationRecord JSON files (ADR-TS-001 §1). Default '.specorator/sessions'. */
	readonly sessionsFolder: string
	/** Max concurrent tabs (ADR-TS-002 §1). Default 3; resolved-and-clamped to MIN_TABS..MAX_TABS_CEILING. */
	readonly maxTabs: number
}

export const DEFAULT_SETTINGS: PluginSettings = {
	locale: 'en',
	logLevel: 'warn',
	sessionsFolder: '.specorator/sessions',
	maxTabs: 3,
}

/** Tab-count bounds (ADR-TS-002 §1). MIN diverges from Claudian's floor of 3 deliberately. */
export const MIN_TABS = 1 as const
export const MAX_TABS_CEILING = 10 as const

/**
 * Resolve a raw `sessionsFolder` input to a safe vault-relative folder
 * (SPEC-TS-005): trim; strip a leading/trailing `/`; collapse internal `//`; an
 * empty result falls back to the default. **Never returns `''`** (writing records
 * to the vault root). Mirrors the `specsFolder` resolve (ADR-005). Pure/total.
 */
export function resolveSessionsFolder(raw: string): string {
	const collapsed = raw
		.trim()
		.replace(/^\/+/, '')
		.replace(/\/+$/, '')
		.replace(/\/{2,}/g, '/')
	return collapsed.length > 0 ? collapsed : DEFAULT_SETTINGS.sessionsFolder
}

/**
 * Clamp a raw `maxTabs` input to `[MIN_TABS, MAX_TABS_CEILING]` (SPEC-TS-005):
 * `Number.isFinite ? clamp(trunc, MIN, CEILING) : default`. So `0 -> 1`,
 * `99 -> 10`, `NaN -> 3`, `2.7 -> 2`. Pure/total.
 */
export function clampMaxTabs(raw: number): number {
	if (!Number.isFinite(raw)) return DEFAULT_SETTINGS.maxTabs
	const truncated = Math.trunc(raw)
	return Math.min(Math.max(truncated, MIN_TABS), MAX_TABS_CEILING)
}
