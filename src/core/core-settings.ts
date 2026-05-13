import { defineModule } from '@/modules/module'
import { DEFAULT_SETTINGS, type PluginSettings } from '@/domain/settings/PluginSettings'

const VALID_LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const
const VALID_GATE_STRICTNESS = ['strict', 'lenient'] as const

function coerceString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

export const coreSettingsModule = defineModule<PluginSettings>({
  id: 'specorator',
  settingsKey: 'specorator',
  settingsVersion: 2,
  settingsDefaults: { ...DEFAULT_SETTINGS },

  /**
   * Migrate stored settings forward to the current schema version.
   *
   * v1 → v2: introduces `mcpServerEnabled`. Default it to `false` (opt-out)
   * for upgrading installs so existing users do not silently start receiving
   * a local MCP server. Only inject when absent — never flip an existing
   * user choice.
   */
  migrate(fromVersion: number, blob: unknown): unknown {
    const out = (blob !== null && typeof blob === 'object' && !Array.isArray(blob)
      ? { ...(blob as Record<string, unknown>) }
      : {}) as Record<string, unknown>
    if (fromVersion < 2 && !('mcpServerEnabled' in out)) {
      out.mcpServerEnabled = false
    }
    return out
  },

  validateSettings(raw: unknown): PluginSettings {
    const r = (raw ?? {}) as Partial<PluginSettings>
    return {
      locale: coerceString(r.locale, DEFAULT_SETTINGS.locale),
      specsFolder: coerceString(r.specsFolder, DEFAULT_SETTINGS.specsFolder),
      archiveFolder: coerceString(r.archiveFolder, DEFAULT_SETTINGS.archiveFolder),
      decisionsFolder: coerceString(r.decisionsFolder, DEFAULT_SETTINGS.decisionsFolder),
      constitutionFile: coerceString(r.constitutionFile, DEFAULT_SETTINGS.constitutionFile),
      gateStrictness: (VALID_GATE_STRICTNESS as ReadonlyArray<string>).includes(r.gateStrictness as string)
        ? r.gateStrictness!
        : DEFAULT_SETTINGS.gateStrictness,
      teamMode: typeof r.teamMode === 'boolean' ? r.teamMode : DEFAULT_SETTINGS.teamMode,
      logLevel: (VALID_LOG_LEVELS as ReadonlyArray<string>).includes(r.logLevel as string)
        ? r.logLevel!
        : DEFAULT_SETTINGS.logLevel,
      mcpServerEnabled:
        typeof r.mcpServerEnabled === 'boolean' ? r.mcpServerEnabled : DEFAULT_SETTINGS.mcpServerEnabled,
      userPersona: typeof r.userPersona === 'string' ? r.userPersona : DEFAULT_SETTINGS.userPersona,
      onboardingComplete:
        typeof r.onboardingComplete === 'boolean'
          ? r.onboardingComplete
          : DEFAULT_SETTINGS.onboardingComplete,
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
        type: 'text',
        key: 'specsFolder',
        label: 'Specs folder',
        description: 'Vault folder where spec directories are created (agentic-workflow convention: specs).',
        default: DEFAULT_SETTINGS.specsFolder,
      },
      {
        type: 'text',
        key: 'archiveFolder',
        label: 'Archive folder',
        description: 'Vault folder for archived features.',
        default: DEFAULT_SETTINGS.archiveFolder,
      },
      {
        type: 'text',
        key: 'decisionsFolder',
        label: 'Decisions folder',
        description: 'Vault folder for architecture decision records.',
        default: DEFAULT_SETTINGS.decisionsFolder,
      },
      {
        type: 'text',
        key: 'constitutionFile',
        label: 'Constitution file',
        description: 'Vault path to the project constitution markdown file.',
        default: DEFAULT_SETTINGS.constitutionFile,
      },
      {
        type: 'dropdown',
        key: 'gateStrictness',
        label: 'Gate strictness',
        description: 'Strict: blocks advancement when required artifacts are missing. Lenient: warns only.',
        options: [
          { value: 'strict', label: 'Strict' },
          { value: 'lenient', label: 'Lenient' },
        ],
        default: DEFAULT_SETTINGS.gateStrictness,
      },
      {
        type: 'toggle',
        key: 'teamMode',
        label: 'Team mode',
        description: 'Enable peer sign-off and multi-author attribution.',
        default: DEFAULT_SETTINGS.teamMode,
      },
      {
        type: 'dropdown',
        key: 'logLevel',
        label: 'Log level',
        description: 'Console log verbosity. Errors and warnings are always useful; lower levels are noisy.',
        options: [
          { value: 'debug', label: 'Debug' },
          { value: 'info', label: 'Info' },
          { value: 'warn', label: 'Warn (default)' },
          { value: 'error', label: 'Error' },
        ],
        default: DEFAULT_SETTINGS.logLevel,
      },
      {
        type: 'toggle',
        key: 'mcpServerEnabled',
        label: 'Enable MCP server (advanced)',
        description:
          'Allow local MCP clients to access your Specorator data via 127.0.0.1. Off by default for privacy.',
        default: DEFAULT_SETTINGS.mcpServerEnabled,
      },
      {
        type: 'text',
        key: 'userPersona',
        label: 'User persona',
        description: 'Your role or persona, used to personalise AI interactions.',
        default: DEFAULT_SETTINGS.userPersona,
      },
      {
        type: 'toggle',
        key: 'onboardingComplete',
        label: 'Onboarding complete',
        description: 'Set automatically after the setup wizard finishes.',
        default: DEFAULT_SETTINGS.onboardingComplete,
      },
    ],
  },

  init() {
    // Lifecycle owned by main.ts; this module exists for schema declaration only.
  },
})
