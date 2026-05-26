import type { ProviderId } from '@/domain/chat/ProviderId'

/**
 * Domain-level plugin configuration. Persisted via `SettingsPort` (device-local
 * store, ADR-PSR-002) and read by the i18n seam + logger filter.
 *
 * P0 reboot (ADR-PSR-001, SPEC-PSR-001): reduced to the two device-scoped
 * fields with a live consumer — `locale` (i18n) and `logLevel` (LoggerPort
 * filter). P3 threads-sessions (SPEC-TS-005) grows it additively with
 * `sessionsFolder` + `maxTabs` — both device-local *preferences about*
 * persistence, never transcript content (NFR-TS-013). P9 providers-registry
 * (SPEC-PV-001/027) grows it additively with `activeProvider` + `enabledProviders`
 * — device-local provider selection, never a secret (ADR-PV-002). No secret value
 * ever lives here.
 */
export interface PluginSettings {
	readonly locale: string
	readonly logLevel: 'debug' | 'info' | 'warn' | 'error'
	// ---- P3 threads-sessions (SPEC-TS-005) ----
	/** Vault folder holding ConversationRecord JSON files (ADR-TS-001 §1). Default '.specorator/sessions'. */
	readonly sessionsFolder: string
	/** Max concurrent tabs (ADR-TS-002 §1). Default 3; resolved-and-clamped to MIN_TABS..MAX_TABS_CEILING. */
	readonly maxTabs: number
	// ---- P4 composer-power (SPEC-CP-005) ----
	/**
	 * The custom system prompt that instruction mode APPENDS to (REQ-CP-018).
	 * Device-local, never a secret. Default ''. No migration — load-or-default.
	 */
	readonly customSystemPrompt: string
	// ---- P9 providers-registry (SPEC-PV-001/027) ----
	/**
	 * The recorded active provider (REQ-PV-004). Device-local. Default `'claude'`.
	 * Resolved through `resolveActiveProvider` — an unknown/disabled value falls
	 * back to `'claude'` (SPEC-PV-003, REQ-PV-003). Never a secret.
	 */
	readonly activeProvider: ProviderId
	/**
	 * The providers the user has explicitly enabled beyond Claude (REQ-PV-103).
	 * Device-local. Default `[]` → both non-Claude providers disabled on a fresh
	 * install (Claude is always enabled; its membership is implicit, SPEC-PV-002).
	 */
	readonly enabledProviders: readonly ProviderId[]
}

export const DEFAULT_SETTINGS: PluginSettings = {
	locale: 'en',
	logLevel: 'warn',
	sessionsFolder: '.specorator/sessions',
	maxTabs: 3,
	customSystemPrompt: '',
	activeProvider: 'claude',
	enabledProviders: [],
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

/**
 * Append an instruction to the existing custom system prompt (SPEC-CP-005,
 * REQ-CP-018): an empty `existing` yields the raw `instruction`; a non-empty
 * `existing` yields `existing + '\n\n' + instruction`. **Append, never
 * overwrite.** Pure/total. The accept path passes the result to
 * `SettingsPort.saveSettings({ customSystemPrompt })`.
 */
export function appendInstruction(existing: string, instruction: string): string {
	return existing === '' ? instruction : `${existing}\n\n${instruction}`
}

/** The closed set of provider ids (SPEC-PV-001). The single source for coercion. */
const VALID_PROVIDER_IDS = ['claude', 'codex', 'opencode'] as const

/**
 * Coerce a raw `activeProvider` device-local value to a valid `ProviderId`
 * (SPEC-PV-001/027): one of the three ids, else `'claude'`. Load-or-default,
 * never throws. Pure/total. (The registry's `resolveActiveProvider` additionally
 * gates on enablement; this is the storage-layer shape coercion.)
 */
export function coerceActiveProvider(raw: unknown): ProviderId {
	return (VALID_PROVIDER_IDS as readonly string[]).includes(raw as string)
		? (raw as ProviderId)
		: DEFAULT_SETTINGS.activeProvider
}

/**
 * Coerce a raw `enabledProviders` device-local value to a deduplicated list of
 * valid `ProviderId`s (SPEC-PV-001/027, REQ-PV-103): a non-array → `[]`; unknown
 * members dropped; duplicates removed. Load-or-default, never throws. Pure/total.
 */
export function coerceEnabledProviders(raw: unknown): readonly ProviderId[] {
	if (!Array.isArray(raw)) return []
	const seen = new Set<ProviderId>()
	for (const item of raw) {
		if ((VALID_PROVIDER_IDS as readonly string[]).includes(item as string)) {
			seen.add(item as ProviderId)
		}
	}
	return [...seen]
}
