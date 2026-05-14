import { describe, it, expect } from 'vitest'
import { promoteLegacyFlatSettings, PLUGIN_SETTINGS_KEYS } from '@/plugin/loadSettings-migrate'

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
      'mcpServerEnabled',
      'anthropicApiKey',
    ])
  })
})
