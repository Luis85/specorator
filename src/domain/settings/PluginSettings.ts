/**
 * Domain-level plugin configuration. Persisted via `SettingsPort` (device-local
 * store, ADR-PSR-002) and read by the i18n seam + logger filter.
 *
 * P0 reboot (ADR-PSR-001, SPEC-PSR-001): reduced to the two device-scoped
 * fields with a live consumer — `locale` (i18n) and `logLevel` (LoggerPort
 * filter). The feature/workflow/provider fields were dropped with their
 * subsystems. No `@/domain/chat` import (REQ-PSR-005/006).
 */
export interface PluginSettings {
	readonly locale: string
	readonly logLevel: 'debug' | 'info' | 'warn' | 'error'
}

export const DEFAULT_SETTINGS: PluginSettings = {
	locale: 'en',
	logLevel: 'warn',
}
