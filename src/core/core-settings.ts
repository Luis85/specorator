import { defineModule } from '@/modules/module'
import { DEFAULT_SETTINGS, type PluginSettings } from '@/domain/settings/PluginSettings'

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
    return {
      locale: coerceString(r.locale, DEFAULT_SETTINGS.locale),
      logLevel: coerceEnum(r.logLevel, VALID_LOG_LEVELS, DEFAULT_SETTINGS.logLevel),
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
    ],
  },

  init() {
    // Lifecycle owned by main.ts; this module declares schema + defaults only.
  },
})
