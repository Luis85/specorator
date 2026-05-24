import { defineModule } from '@/modules/module'
import { DEFAULT_SETTINGS, type PluginSettings } from '@/domain/settings/PluginSettings'
import type { ProviderId, ProviderSelection } from '@/domain/chat/ProviderSelection'

const VALID_LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const
const VALID_GATE_STRICTNESS = ['strict', 'lenient'] as const
const VALID_PROVIDER_IDS: ReadonlyArray<ProviderId> = ['claude', 'cursor'] as const
const VALID_PROVIDER_MODES = ['api', 'cli'] as const
const VALID_FORCED_SENTINELS = ['auto', 'degraded'] as const

function coerceString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function coerceEnum<T extends string>(value: unknown, allowed: ReadonlyArray<T>, fallback: T): T {
  return (allowed as ReadonlyArray<string>).includes(value as string) ? (value as T) : fallback
}

function coerceBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function coerceNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function coercePassthroughString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function coerceTrimmedString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value.trim() : fallback
}

/**
 * Validate a `providerSelection` candidate against the discriminated-union
 * shape declared in SPEC-MPS-001 §2.2. Falls back to the documented default
 * `{ forced: 'auto' }` when the value is missing, malformed, or carries an
 * unrecognised sentinel/provider/mode.
 */
function validateProviderSelection(value: unknown): ProviderSelection {
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    if (typeof obj.forced === 'string' && (VALID_FORCED_SENTINELS as ReadonlyArray<string>).includes(obj.forced)) {
      return { forced: obj.forced as 'auto' | 'degraded' }
    }
    if (
      typeof obj.provider === 'string' &&
      (VALID_PROVIDER_IDS as ReadonlyArray<string>).includes(obj.provider) &&
      typeof obj.mode === 'string' &&
      (VALID_PROVIDER_MODES as ReadonlyArray<string>).includes(obj.mode)
    ) {
      return {
        provider: obj.provider as ProviderId,
        mode: obj.mode as 'api' | 'cli',
      }
    }
  }
  return DEFAULT_SETTINGS.providerSelection
}

/**
 * Validate the `providerModel` record. Each provider falls back to its
 * documented default when missing or non-string.
 */
function validateProviderModel(
  value: unknown,
): Readonly<Record<ProviderId, string>> {
  const fallback = DEFAULT_SETTINGS.providerModel
  if (value === null || typeof value !== 'object') return fallback
  const obj = value as Record<string, unknown>
  return {
    claude: typeof obj.claude === 'string' ? obj.claude : fallback.claude,
    cursor: typeof obj.cursor === 'string' ? obj.cursor : fallback.cursor,
  }
}

function toMutableBlob(blob: unknown): { out: Record<string, unknown>; hadData: boolean } {
  const isObjectBlob = blob !== null && typeof blob === 'object' && !Array.isArray(blob)
  const out: Record<string, unknown> = isObjectBlob ? { ...(blob as Record<string, unknown>) } : {}
  return { out, hadData: isObjectBlob && Object.keys(out).length > 0 }
}

export const coreSettingsModule = defineModule<PluginSettings>({
  id: 'specorator',
  settingsKey: 'specorator',
  settingsVersion: 3,
  settingsDefaults: { ...DEFAULT_SETTINGS },

  /**
   * Migrate stored settings forward to the current schema version.
   *
   * v1 → v2: introduces `mcpServerEnabled`. Default it to `false` (opt-out)
   * for upgrading installs so existing users do not silently start receiving
   * a local MCP server. Only inject when absent — never flip an existing
   * user choice.
   *
   * v2 → v3: introduces `onboardingComplete`. Default it to `true` for
   * upgrading installs so existing users are not forced through the wizard on
   * next launch. "Upgrading" means fromVersion >= 1 OR fromVersion === 0 with
   * a non-empty blob (unversioned existing installs never stored a version key
   * and therefore arrive as v0 even though they have real settings). Fresh
   * installs arrive as v0 with a null or empty blob and are left without the
   * key so validateSettings falls through to DEFAULT_SETTINGS.onboardingComplete
   * (false) and the wizard runs normally.
   */
  migrate(fromVersion: number, blob: unknown): unknown {
    const { out, hadData } = toMutableBlob(blob)
    if (fromVersion < 2 && !('mcpServerEnabled' in out)) {
      out.mcpServerEnabled = false
    }
    if ((fromVersion >= 1 || (fromVersion === 0 && hadData)) && fromVersion < 3 && !('onboardingComplete' in out)) {
      out.onboardingComplete = true
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
      gateStrictness: coerceEnum(r.gateStrictness, VALID_GATE_STRICTNESS, DEFAULT_SETTINGS.gateStrictness),
      teamMode: coerceBoolean(r.teamMode, DEFAULT_SETTINGS.teamMode),
      logLevel: coerceEnum(r.logLevel, VALID_LOG_LEVELS, DEFAULT_SETTINGS.logLevel),
      mcpServerEnabled: coerceBoolean(r.mcpServerEnabled, DEFAULT_SETTINGS.mcpServerEnabled),
      userPersona: coercePassthroughString(r.userPersona, DEFAULT_SETTINGS.userPersona),
      onboardingComplete: coerceBoolean(r.onboardingComplete, DEFAULT_SETTINGS.onboardingComplete),
      claudeCliPath: coerceTrimmedString(r.claudeCliPath, DEFAULT_SETTINGS.claudeCliPath),
      // REQ-OCM-016 — additive string field; missing/non-string coerces to '' so
      // both fresh and upgrading installs land on the default without a version bump.
      obsidianCliPath: coerceTrimmedString(r.obsidianCliPath, DEFAULT_SETTINGS.obsidianCliPath),
      // Additive boolean; missing/non-boolean coerces to true (default-on) so
      // existing installs auto-opt-in to the terminal-CLI parity behaviour.
      writeProjectMcpConfig: coerceBoolean(r.writeProjectMcpConfig, DEFAULT_SETTINGS.writeProjectMcpConfig),
      // SPEC-MPS-001 §2.7 — the new provider-selection carrier plus the
      // five companion fields. `transportKind` is intentionally NOT
      // re-emitted here: migration (`migrateProviderSelection`) translates
      // any persisted legacy value into `providerSelection` and deletes the
      // legacy key, so re-introducing it during validation would resurrect
      // a half-migrated state. WS-3 removes the deprecated optional from
      // the type entirely.
      providerSelection: validateProviderSelection(r.providerSelection),
      cursorCliPath: coerceTrimmedString(r.cursorCliPath, DEFAULT_SETTINGS.cursorCliPath),
      cursorApiPreview: coerceBoolean(r.cursorApiPreview, DEFAULT_SETTINGS.cursorApiPreview),
      autoPreferProvider: coerceEnum(
        r.autoPreferProvider,
        VALID_PROVIDER_IDS,
        DEFAULT_SETTINGS.autoPreferProvider,
      ),
      providerModel: validateProviderModel(r.providerModel),
      chatTabCap: coerceNumber(r.chatTabCap, DEFAULT_SETTINGS.chatTabCap),
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
