import { defineModule } from '@/modules/module'
import {
  DEFAULT_SETTINGS,
  resolveSessionsFolder,
  clampMaxTabs,
  coerceActiveProvider,
  coerceEnabledProviders,
  coerceHomeFsConsent,
  coerceOptionalSettingsFields,
  type PluginSettings,
} from '@/domain/settings/PluginSettings'

const VALID_LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const

function coerceString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function coerceEnum<T extends string>(
  value: unknown,
  allowed: ReadonlyArray<T>,
  fallback: T,
): T {
  return (allowed as ReadonlyArray<string>).includes(value as string) ? (value as T) : fallback
}

/**
 * Core settings module (P0 reboot — SPEC-PSR-002).
 *
 * **Load-or-default, no backwards compatibility (CHARTER-REQ-FRESH / NG8):** the
 * module has no `migrate()` and does not bump `settingsVersion`. On load, the
 * stored device-local blob is validated and coerced to exactly
 * `{ locale, logLevel }`; an absent or corrupt blob yields `DEFAULT_SETTINGS`.
 * Unknown keys are never carried through.
 */
export const coreSettingsModule = defineModule<PluginSettings>({
  id: 'specorator',
  settingsKey: 'specorator',
  settingsDefaults: { ...DEFAULT_SETTINGS },

  validateSettings(raw: unknown): PluginSettings {
    const r = (raw ?? {}) as Partial<PluginSettings>
    // P10 (SPEC-SS-001/012, REQ-SS-092): the six additive OPTIONAL device-local
    // fields are assembled by the shared `coerceOptionalSettingsFields` helper — each
    // present only when present so the exact-key contract stays byte-identical P9
    // (NFR-SS-001). No migration (NG8). A secret-bearing env value lives only in
    // SecretStorePort — the struct/scope here holds only a `secretRef` (SPEC-SS-019).
    const homeFsConsent = coerceHomeFsConsent(r.homeFsConsent)
    return {
      locale: coerceString(r.locale, DEFAULT_SETTINGS.locale),
      logLevel: coerceEnum(r.logLevel, VALID_LOG_LEVELS, DEFAULT_SETTINGS.logLevel),
      // P3 (SPEC-TS-005): resolve/clamp through the pure helpers on save.
      sessionsFolder: resolveSessionsFolder(
        typeof r.sessionsFolder === 'string' ? r.sessionsFolder : '',
      ),
      maxTabs: clampMaxTabs(typeof r.maxTabs === 'number' ? r.maxTabs : Number.NaN),
      // P4 (SPEC-CP-005): the custom system prompt is device-local, written by
      // instruction mode (SPEC-CP-027), not a settings-tab field (settings UX is
      // P10). Load-or-default the persisted blob; never a secret, no migration.
      customSystemPrompt:
        typeof r.customSystemPrompt === 'string'
          ? r.customSystemPrompt
          : DEFAULT_SETTINGS.customSystemPrompt,
      // P9 (SPEC-PV-001/027): the device-local provider selection. Load-or-default
      // through the pure coercers — never a secret, no migration (ADR-PV-002).
      activeProvider: coerceActiveProvider(r.activeProvider),
      enabledProviders: coerceEnabledProviders(r.enabledProviders),
      // P9 (SPEC-PV-014/024, REQ-PV-082): the one-time beyond-vault consent record
      // MUST round-trip so a recorded consent survives a reload (EC-PV-6). OPTIONAL —
      // absent when nothing recorded (byte-identical P0–P8, NFR-PV-001).
      ...(homeFsConsent !== undefined ? { homeFsConsent } : {}),
      // P10 (SPEC-SS-001/012): the six OPTIONAL fields, each present only when present.
      ...coerceOptionalSettingsFields(r),
    }
  },

  settingsSchema: {
    fields: [
      {
        type: 'dropdown',
        key: 'locale',
        label: 'Language',
        description: 'Display language for the Specorator panel.',
        options: [
          { value: 'en', label: 'English' },
          { value: 'de', label: 'Deutsch' },
        ],
        default: DEFAULT_SETTINGS.locale,
      },
      {
        type: 'dropdown',
        key: 'logLevel',
        label: 'Log level',
        description:
          'Console log verbosity. Errors and warnings are always useful; lower levels are noisy.',
        options: [
          { value: 'debug', label: 'Debug' },
          { value: 'info', label: 'Info' },
          { value: 'warn', label: 'Warn (default)' },
          { value: 'error', label: 'Error' },
        ],
        default: DEFAULT_SETTINGS.logLevel,
      },
      // P3 threads-sessions (SPEC-TS-005). Both flow through resolveSessionsFolder/
      // clampMaxTabs in validateSettings on save.
      {
        type: 'text',
        key: 'sessionsFolder',
        label: 'Sessions folder',
        description:
          'Vault folder holding conversation history (one JSON file per conversation).',
        default: DEFAULT_SETTINGS.sessionsFolder,
      },
      {
        type: 'number',
        key: 'maxTabs',
        label: 'Max tabs',
        description: 'Maximum concurrent chat tabs (1–10).',
        default: DEFAULT_SETTINGS.maxTabs,
      },
    ],
  },

  init() {
    // Lifecycle owned by main.ts; this module declares schema + defaults only.
  },
})
