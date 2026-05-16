import { describe, it, expect } from 'vitest'
import { coreSettingsModule } from '@/core/core-settings'
import { DEFAULT_SETTINGS, type PluginSettings } from '@/domain/settings/PluginSettings'
import { fakeModulePorts } from '../__fakes__/fake-ports'

describe('coreSettingsModule descriptor metadata', () => {
  it('has the expected id and settingsKey', () => {
    expect(coreSettingsModule.id).toBe('specorator')
    expect(coreSettingsModule.settingsKey).toBe('specorator')
  })

  it('settingsDefaults equals DEFAULT_SETTINGS', () => {
    expect(coreSettingsModule.settingsDefaults).toEqual(DEFAULT_SETTINGS)
  })

  it('defaults mcpServerEnabled to false (privacy-by-default)', () => {
    expect(DEFAULT_SETTINGS.mcpServerEnabled).toBe(false)
    expect(coreSettingsModule.settingsDefaults?.mcpServerEnabled).toBe(false)
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

  // T-ASM-015 — migration of new fields (REQ-ASM-002, REQ-ASM-004; SPEC-ASM-001 §11.2)
  describe('claudeCliPath and transportKind (T-ASM-015)', () => {
    it('defaults claudeCliPath and transportKind when old settings lack the new fields', () => {
      const out = validate({ locale: 'en', specsFolder: 'specs' })
      expect(out.claudeCliPath).toBe(DEFAULT_SETTINGS.claudeCliPath)
      expect(out.claudeCliPath).toBe('')
      expect(out.transportKind).toBe(DEFAULT_SETTINGS.transportKind)
      expect(out.transportKind).toBe('auto')
    })

    it("coerces garbage transportKind (e.g. 'invalid') to default 'auto'", () => {
      const out = validate({ transportKind: 'invalid' })
      expect(out.transportKind).toBe('auto')
    })

    it.each([null, undefined, 42, true, {}, []] as const)(
      'coerces non-string claudeCliPath (%p) to default empty string',
      (value) => {
        const out = validate({ claudeCliPath: value })
        expect(out.claudeCliPath).toBe('')
      },
    )

    it.each(['auto', 'api-key', 'subscription', 'degraded'] as const)(
      "preserves valid transportKind '%s' (idempotent)",
      (kind) => {
        const out = validate({ transportKind: kind })
        expect(out.transportKind).toBe(kind)
      },
    )

    it('preserves and trims a valid claudeCliPath (idempotent on trimmed input)', () => {
      const out = validate({ claudeCliPath: '/usr/local/bin/claude' })
      expect(out.claudeCliPath).toBe('/usr/local/bin/claude')
    })

    it('trims surrounding whitespace on claudeCliPath per §11.2', () => {
      const out = validate({ claudeCliPath: '  /opt/bin/claude  ' })
      expect(out.claudeCliPath).toBe('/opt/bin/claude')
    })
  })
})

describe('coreSettingsModule.settingsSchema', () => {
  it('exposes a field descriptor for every module-driven PluginSettings key', () => {
    // `anthropicApiKey` is rendered outside the module loop (SPEC-CCS-001 §8.3, D-CCS-002).
    // `claudeCliPath` is rendered by the custom ClaudeCliPathField.vue component
    // (SPEC-ASM-001 §7.5, T-ASM-016) and `transportKind` is not a user-facing
    // settings field (its value is driven by transport-selection logic).
    // All three are intentionally absent from settingsSchema.fields.
    const manuallyRenderedKeys: ReadonlyArray<keyof PluginSettings> = [
      'anthropicApiKey',
      'claudeCliPath',
      'transportKind',
    ]
    const expected = Object.keys(DEFAULT_SETTINGS).length - manuallyRenderedKeys.length
    expect(coreSettingsModule.settingsSchema?.fields).toHaveLength(expected)
  })

  it('every field key is a valid PluginSettings key', () => {
    const validKeys = Object.keys(DEFAULT_SETTINGS) as ReadonlyArray<keyof PluginSettings>
    const fieldKeys = coreSettingsModule.settingsSchema?.fields.map((f) => f.key) ?? []
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
