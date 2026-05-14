import { describe, it, expect } from 'vitest'
import { coreSettingsModule } from '@/core/core-settings'
import { DEFAULT_SETTINGS, type PluginSettings } from '@/domain/settings/PluginSettings'
import { fakeModulePorts } from '../__fakes__/fake-ports'

describe('coreSettingsModule descriptor metadata', () => {
  it('has the expected id, settingsKey, and settingsVersion', () => {
    expect(coreSettingsModule.id).toBe('specorator')
    expect(coreSettingsModule.settingsKey).toBe('specorator')
    expect(coreSettingsModule.settingsVersion).toBe(3)
  })

  it('settingsDefaults equals DEFAULT_SETTINGS', () => {
    expect(coreSettingsModule.settingsDefaults).toEqual(DEFAULT_SETTINGS)
  })

  it('defaults mcpServerEnabled to false (privacy-by-default)', () => {
    expect(DEFAULT_SETTINGS.mcpServerEnabled).toBe(false)
    expect(coreSettingsModule.settingsDefaults?.mcpServerEnabled).toBe(false)
  })
})

describe('coreSettingsModule.migrate (v1 → v2 mcpServerEnabled)', () => {
  const migrate = (fromVersion: number, blob: unknown): unknown => {
    const fn = coreSettingsModule.migrate
    if (!fn) throw new Error('migrate is undefined')
    return fn(fromVersion, blob)
  }

  it('injects mcpServerEnabled=false when migrating from v0 with no value', () => {
    const out = migrate(0, {}) as Record<string, unknown>
    expect(out.mcpServerEnabled).toBe(false)
  })

  it('injects mcpServerEnabled=false when migrating from v1 with no value', () => {
    const out = migrate(1, { teamMode: true }) as Record<string, unknown>
    expect(out.mcpServerEnabled).toBe(false)
    expect(out.teamMode).toBe(true)
  })

  it('preserves an existing mcpServerEnabled=true during migration (never flips user choice)', () => {
    const out = migrate(0, { mcpServerEnabled: true }) as Record<string, unknown>
    expect(out.mcpServerEnabled).toBe(true)
  })

  it('preserves an existing mcpServerEnabled=false during migration', () => {
    const out = migrate(0, { mcpServerEnabled: false }) as Record<string, unknown>
    expect(out.mcpServerEnabled).toBe(false)
  })

  it('does not inject when already at the target version (fromVersion >= 2)', () => {
    const out = migrate(2, {}) as Record<string, unknown>
    expect('mcpServerEnabled' in out).toBe(false)
  })

  it('returns a fresh object when blob is null or non-object', () => {
    expect(migrate(0, null)).toEqual({ mcpServerEnabled: false })
    expect(migrate(0, 'string-junk')).toEqual({ mcpServerEnabled: false })
    expect(migrate(0, [])).toEqual({ mcpServerEnabled: false })
  })
})

describe('coreSettingsModule.migrate (v2 → v3 onboardingComplete)', () => {
  const migrate = (fromVersion: number, blob: unknown): unknown => {
    const fn = coreSettingsModule.migrate
    if (!fn) throw new Error('migrate is undefined')
    return fn(fromVersion, blob)
  }

  it('injects onboardingComplete=true when upgrading from v1 (existing install)', () => {
    const out = migrate(1, { specsFolder: 'specs' }) as Record<string, unknown>
    expect(out.onboardingComplete).toBe(true)
  })

  it('injects onboardingComplete=true when upgrading from v2 (existing install)', () => {
    const out = migrate(2, { specsFolder: 'specs' }) as Record<string, unknown>
    expect(out.onboardingComplete).toBe(true)
  })

  it('does NOT inject onboardingComplete for a fresh install (fromVersion=0, empty blob)', () => {
    const out = migrate(0, {}) as Record<string, unknown>
    expect('onboardingComplete' in out).toBe(false)
  })

  it('injects onboardingComplete=true for unversioned existing install (fromVersion=0, non-empty blob)', () => {
    const out = migrate(0, { specsFolder: 'specs', locale: 'en' }) as Record<string, unknown>
    expect(out.onboardingComplete).toBe(true)
  })

  it('does not inject onboardingComplete when already at v3 or later', () => {
    const out = migrate(3, {}) as Record<string, unknown>
    expect('onboardingComplete' in out).toBe(false)
  })

  it('preserves existing onboardingComplete=false when upgrading', () => {
    const out = migrate(2, { onboardingComplete: false }) as Record<string, unknown>
    expect(out.onboardingComplete).toBe(false)
  })

  it('preserves existing onboardingComplete=true when upgrading', () => {
    const out = migrate(2, { onboardingComplete: true }) as Record<string, unknown>
    expect(out.onboardingComplete).toBe(true)
  })
})

describe('coreSettingsModule.validateSettings', () => {
  const validate = (raw: unknown): PluginSettings => {
    const fn = coreSettingsModule.validateSettings
    if (!fn) throw new Error('validateSettings is undefined')
    return fn(raw)
  }

  it('returns DEFAULT_SETTINGS for empty object input', () => {
    expect(validate({})).toEqual(DEFAULT_SETTINGS)
  })

  it('returns DEFAULT_SETTINGS for null input', () => {
    expect(validate(null)).toEqual(DEFAULT_SETTINGS)
  })

  it('returns DEFAULT_SETTINGS for undefined input', () => {
    expect(validate(undefined)).toEqual(DEFAULT_SETTINGS)
  })

  it('coerces whitespace-only specsFolder to the default', () => {
    const out = validate({ specsFolder: '   ' })
    expect(out.specsFolder).toBe(DEFAULT_SETTINGS.specsFolder)
  })

  it('coerces empty string specsFolder to the default', () => {
    const out = validate({ specsFolder: '' })
    expect(out.specsFolder).toBe(DEFAULT_SETTINGS.specsFolder)
  })

  it('coerces non-string locale to the default', () => {
    const out = validate({ locale: 123 })
    expect(out.locale).toBe(DEFAULT_SETTINGS.locale)
  })

  it('trims valid string fields', () => {
    const out = validate({
      specsFolder: '  foo  ',
      archiveFolder: '\tbar\n',
      decisionsFolder: '  baz',
      constitutionFile: 'CONST.md  ',
      locale: '  de  ',
    })
    expect(out.specsFolder).toBe('foo')
    expect(out.archiveFolder).toBe('bar')
    expect(out.decisionsFolder).toBe('baz')
    expect(out.constitutionFile).toBe('CONST.md')
    expect(out.locale).toBe('de')
  })

  it('falls back to default gateStrictness when invalid', () => {
    const out = validate({ gateStrictness: 'bogus' })
    expect(out.gateStrictness).toBe(DEFAULT_SETTINGS.gateStrictness)
  })

  it("keeps gateStrictness 'lenient' when valid", () => {
    const out = validate({ gateStrictness: 'lenient' })
    expect(out.gateStrictness).toBe('lenient')
  })

  it("keeps gateStrictness 'strict' when valid", () => {
    const out = validate({ gateStrictness: 'strict' })
    expect(out.gateStrictness).toBe('strict')
  })

  it('falls back to default logLevel when invalid', () => {
    const out = validate({ logLevel: 'trace' })
    expect(out.logLevel).toBe(DEFAULT_SETTINGS.logLevel)
  })

  it.each(['debug', 'info', 'warn', 'error'] as const)(
    "keeps logLevel '%s' when valid",
    (level) => {
      const out = validate({ logLevel: level })
      expect(out.logLevel).toBe(level)
    },
  )

  it('falls back to default teamMode when non-boolean', () => {
    const out = validate({ teamMode: 'yes' })
    expect(out.teamMode).toBe(DEFAULT_SETTINGS.teamMode)
  })

  it('preserves teamMode=true when boolean', () => {
    const out = validate({ teamMode: true })
    expect(out.teamMode).toBe(true)
  })

  it('preserves teamMode=false when boolean', () => {
    const out = validate({ teamMode: false })
    expect(out.teamMode).toBe(false)
  })

  it('defaults mcpServerEnabled to false when missing', () => {
    const out = validate({})
    expect(out.mcpServerEnabled).toBe(false)
  })

  it('coerces non-boolean mcpServerEnabled to false', () => {
    const out = validate({ mcpServerEnabled: 'yes' })
    expect(out.mcpServerEnabled).toBe(false)
  })

  it('coerces null mcpServerEnabled to false', () => {
    const out = validate({ mcpServerEnabled: null })
    expect(out.mcpServerEnabled).toBe(false)
  })

  it('preserves mcpServerEnabled=true when boolean', () => {
    const out = validate({ mcpServerEnabled: true })
    expect(out.mcpServerEnabled).toBe(true)
  })

  it('preserves mcpServerEnabled=false when boolean', () => {
    const out = validate({ mcpServerEnabled: false })
    expect(out.mcpServerEnabled).toBe(false)
  })
})

describe('coreSettingsModule.settingsSchema', () => {
  it('exposes a field descriptor for every PluginSettings key', () => {
    const expected = Object.keys(DEFAULT_SETTINGS).length
    expect(coreSettingsModule.settingsSchema?.fields).toHaveLength(expected)
  })

  it('every field key is a valid PluginSettings key', () => {
    const validKeys = Object.keys(DEFAULT_SETTINGS) as ReadonlyArray<keyof PluginSettings>
    const fieldKeys = coreSettingsModule.settingsSchema?.fields.map((f) => f.key) ?? []
    expect(fieldKeys).toHaveLength(validKeys.length)
    for (const k of fieldKeys) {
      expect(validKeys).toContain(k as keyof PluginSettings)
    }
  })

  it('every field default matches DEFAULT_SETTINGS for its key', () => {
    const fields = coreSettingsModule.settingsSchema?.fields ?? []
    for (const field of fields) {
      expect(field.default).toEqual(
        (DEFAULT_SETTINGS as unknown as Record<string, unknown>)[field.key],
      )
    }
  })

  it('includes a mcpServerEnabled toggle field defaulting to false', () => {
    const field = coreSettingsModule.settingsSchema?.fields.find(
      (f) => f.key === 'mcpServerEnabled',
    )
    expect(field).toBeDefined()
    expect(field?.type).toBe('toggle')
    expect(field?.default).toBe(false)
  })
})

describe('coreSettingsModule.init', () => {
  it('returns void without throwing when invoked with valid ports and defaults', () => {
    const ports = fakeModulePorts()
    const defaults = coreSettingsModule.settingsDefaults
    if (!defaults) throw new Error('settingsDefaults is undefined')
    expect(() => coreSettingsModule.init(ports, defaults)).not.toThrow()
  })
})
