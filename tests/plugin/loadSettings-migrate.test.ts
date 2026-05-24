import { describe, it, expect } from 'vitest'
import { promoteLegacyFlatSettings, stripMcpLegacy, PLUGIN_SETTINGS_KEYS } from '@/plugin/loadSettings-migrate'

describe('promoteLegacyFlatSettings', () => {
  it('promotes flat top-level PluginSettings keys into a specorator sub-key', () => {
    const input: Record<string, unknown> = {
      locale: 'de',
      specsFolder: 'specs',
      logLevel: 'info',
    }

    const out = promoteLegacyFlatSettings(input)

    expect(out.specorator).toEqual({
      locale: 'de',
      specsFolder: 'specs',
      logLevel: 'info',
    })
    // The top-level keys are preserved on the returned object (helper does not
    // strip them; the consumer reads from `specorator` going forward).
    expect(out.locale).toBe('de')
    expect(out.specsFolder).toBe('specs')
    expect(out.logLevel).toBe('info')
  })

  it('does not mutate the input', () => {
    const input: Record<string, unknown> = { locale: 'en' }
    const snapshot = { ...input }

    const out = promoteLegacyFlatSettings(input)

    expect(input).toEqual(snapshot)
    expect(out).not.toBe(input)
  })

  it('skips promotion when specorator sub-key already exists (double-promotion guard)', () => {
    const input: Record<string, unknown> = {
      specorator: { locale: 'fr' },
      // Even though `locale` is also at the top level, the existing sub-key
      // wins and no re-promotion happens.
      locale: 'should-not-overwrite',
    }

    const out = promoteLegacyFlatSettings(input)

    expect(out.specorator).toEqual({ locale: 'fr' })
    expect(out.locale).toBe('should-not-overwrite')
  })

  it('rewrites legacy featuresFolder to specsFolder when specsFolder is absent (NFR-AVS-004)', () => {
    const input: Record<string, unknown> = { featuresFolder: 'old-features' }

    const out = promoteLegacyFlatSettings(input)

    expect(out.specsFolder).toBe('old-features')
    expect(out.featuresFolder).toBe('old-features') // original key preserved
    expect(out.specorator).toEqual({ specsFolder: 'old-features' })
  })

  it('preserves existing specsFolder when both featuresFolder and specsFolder are present', () => {
    const input: Record<string, unknown> = {
      featuresFolder: 'old-features',
      specsFolder: 'current-specs',
    }

    const out = promoteLegacyFlatSettings(input)

    expect(out.specsFolder).toBe('current-specs')
    expect(out.specorator).toEqual({ specsFolder: 'current-specs' })
  })

  it('preserves non-PluginSettings top-level keys at the top level', () => {
    const input: Record<string, unknown> = {
      locale: 'en',
      hello: { showBadge: true },
      _moduleVersions: { hello: 1 },
    }

    const out = promoteLegacyFlatSettings(input)

    // Non-PluginSettings keys remain at top level.
    expect(out.hello).toEqual({ showBadge: true })
    expect(out._moduleVersions).toEqual({ hello: 1 })
    // The specorator sub-key only contains keys from PLUGIN_SETTINGS_KEYS.
    expect(out.specorator).toEqual({ locale: 'en' })
    expect((out.specorator as Record<string, unknown>).hello).toBeUndefined()
    expect((out.specorator as Record<string, unknown>)._moduleVersions).toBeUndefined()
  })

  it('returns specorator as an empty object when input is empty', () => {
    const out = promoteLegacyFlatSettings({})

    expect(out).toEqual({ specorator: {} })
  })

  it('exposes the full list of PluginSettings keys as PLUGIN_SETTINGS_KEYS', () => {
    // Tripwire: if a new PluginSettings field is added, this list must be
    // updated so legacy flat blobs migrate it correctly.
    expect(PLUGIN_SETTINGS_KEYS).toEqual([
      'locale',
      'specsFolder',
      'archiveFolder',
      'decisionsFolder',
      'constitutionFile',
      'gateStrictness',
      'teamMode',
      'logLevel',
      'userPersona',
      'onboardingComplete',
      'claudeCliPath',
      // `transportKind` retained for legacy flat-blob promotion; migration
      // (`migrateProviderSelection`) translates it before any consumer reads it.
      'transportKind',
      'providerSelection',
      'cursorCliPath',
      'cursorApiPreview',
      'autoPreferProvider',
      'providerModel',
      'chatTabCap',
    ])
  })

  it('migrates legacy flat userPersona + onboardingComplete into the specorator sub-key (Codex P2, PR #350)', () => {
    const legacy = {
      locale: 'en',
      userPersona: 'product-manager',
      onboardingComplete: true,
    }
    const promoted = promoteLegacyFlatSettings(legacy)
    const specorator = promoted.specorator as Record<string, unknown>
    expect(specorator.userPersona).toBe('product-manager')
    expect(specorator.onboardingComplete).toBe(true)
    // Sanity check: locale also still migrated.
    expect(specorator.locale).toBe('en')
  })

  it('promotes flat claudeCliPath and transportKind into specorator sub-key (T-ASM-014 §11.4)', () => {
    const input: Record<string, unknown> = {
      claudeCliPath: '/usr/local/bin/claude',
      transportKind: 'subscription',
    }

    const out = promoteLegacyFlatSettings(input)

    expect(out.specorator).toEqual({
      claudeCliPath: '/usr/local/bin/claude',
      transportKind: 'subscription',
    })
    expect(out.claudeCliPath).toBe('/usr/local/bin/claude')
    expect(out.transportKind).toBe('subscription')
  })

  it('skips re-promotion when transportKind is already nested under specorator (double-promotion guard, §11.4)', () => {
    const input: Record<string, unknown> = {
      specorator: { transportKind: 'auto' },
      // Even though `transportKind` is also at the top level, the existing
      // sub-key wins — no re-promotion happens.
      transportKind: 'should-not-overwrite',
    }

    const out = promoteLegacyFlatSettings(input)

    expect(out.specorator).toEqual({ transportKind: 'auto' })
    expect(out.transportKind).toBe('should-not-overwrite')
  })
})

describe('stripMcpLegacy', () => {
  it('strips mcpServerEnabled from the specorator blob and reports stripped=true', () => {
    const input = { specorator: { locale: 'en', mcpServerEnabled: false } }
    const { result, stripped } = stripMcpLegacy(input)
    expect(stripped).toBe(true)
    expect((result.specorator as Record<string, unknown>).mcpServerEnabled).toBeUndefined()
    expect((result.specorator as Record<string, unknown>).locale).toBe('en')
  })

  it('strips obsidianCliPath from the specorator blob and reports stripped=true', () => {
    const input = { specorator: { claudeCliPath: '/usr/bin/claude', obsidianCliPath: '/usr/bin/obsidian' } }
    const { result, stripped } = stripMcpLegacy(input)
    expect(stripped).toBe(true)
    expect((result.specorator as Record<string, unknown>).obsidianCliPath).toBeUndefined()
    expect((result.specorator as Record<string, unknown>).claudeCliPath).toBe('/usr/bin/claude')
  })

  it('strips both legacy keys when both are present', () => {
    const input = { specorator: { mcpServerEnabled: true, obsidianCliPath: '/bin/obs', locale: 'de' } }
    const { result, stripped } = stripMcpLegacy(input)
    expect(stripped).toBe(true)
    const blob = result.specorator as Record<string, unknown>
    expect(blob.mcpServerEnabled).toBeUndefined()
    expect(blob.obsidianCliPath).toBeUndefined()
    expect(blob.locale).toBe('de')
  })

  it('returns stripped=false and the original object when no legacy keys are present', () => {
    const input = { specorator: { locale: 'en' }, hello: { x: 1 } }
    const { result, stripped } = stripMcpLegacy(input)
    expect(stripped).toBe(false)
    expect(result).toBe(input) // same reference — no copy
  })

  it('returns stripped=false when specorator key is absent', () => {
    const input = { hello: { x: 1 } }
    const { result, stripped } = stripMcpLegacy(input)
    expect(stripped).toBe(false)
    expect(result).toBe(input)
  })

  it('returns stripped=false when specorator is not a plain object', () => {
    const inputNull = { specorator: null }
    expect(stripMcpLegacy(inputNull).stripped).toBe(false)
    const inputArray = { specorator: [] }
    expect(stripMcpLegacy(inputArray).stripped).toBe(false)
  })

  it('does not mutate the input', () => {
    const input = { specorator: { mcpServerEnabled: false, locale: 'en' } }
    const snapshot = JSON.parse(JSON.stringify(input)) as typeof input
    stripMcpLegacy(input)
    expect(input).toEqual(snapshot)
  })

  it('preserves top-level keys outside specorator untouched', () => {
    const input = { specorator: { mcpServerEnabled: true }, hello: { x: 1 }, _moduleVersions: { v: 2 } }
    const { result } = stripMcpLegacy(input)
    expect(result.hello).toEqual({ x: 1 })
    expect(result._moduleVersions).toEqual({ v: 2 })
  })
})
