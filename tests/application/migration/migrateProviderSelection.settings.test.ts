/**
 * T-MPS-018 — `migrateProviderSelection`: settings `transportKind` translation.
 *
 * Covers REQ-MPS-004 / TST-MPS-01. The migration must translate each legacy
 * `transportKind` value to the documented `ProviderSelection` and then
 * delete the legacy key from the settings object.
 */
import { describe, it, expect } from 'vitest'
import { migrateProviderSelection } from '@/application/migration/migrateProviderSelection'

describe('migrateProviderSelection — settings.transportKind translation', () => {
  it.each([
    ['auto', { forced: 'auto' }],
    ['api-key', { provider: 'claude', mode: 'api' }],
    ['subscription', { provider: 'claude', mode: 'cli' }],
    ['degraded', { forced: 'degraded' }],
  ] as ReadonlyArray<[string, Record<string, unknown>]>)(
    'translates legacy %s to %o and removes the legacy key',
    (legacy, expected) => {
      const result = migrateProviderSelection({
        settings: { locale: 'en', transportKind: legacy, specsFolder: 'specs' },
      })
      expect(result.migrated).toBe(true)
      expect(result.errors).toEqual([])
      const nextSettings = result.data.settings as Record<string, unknown>
      expect(nextSettings.providerSelection).toEqual(expected)
      expect('transportKind' in nextSettings).toBe(false)
      // Sibling keys preserved.
      expect(nextSettings.locale).toBe('en')
      expect(nextSettings.specsFolder).toBe('specs')
    },
  )

  it('leaves an already-migrated settings blob untouched', () => {
    const before = {
      settings: {
        providerSelection: { provider: 'cursor', mode: 'cli' },
      },
    }
    const result = migrateProviderSelection(before)
    expect(result.migrated).toBe(false)
    expect(result.data.settings).toEqual({
      providerSelection: { provider: 'cursor', mode: 'cli' },
    })
  })

  it('treats an unrecognised legacy transportKind as malformed', () => {
    const result = migrateProviderSelection({
      settings: { transportKind: 'mystery' },
    })
    // Migration still runs — but errors are captured and the legacy key is
    // not deleted blindly; we record the issue so the caller can decide.
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('is a no-op when neither legacy nor new key is present', () => {
    const result = migrateProviderSelection({ settings: { locale: 'en' } })
    expect(result.migrated).toBe(false)
    expect(result.errors).toEqual([])
    expect(result.data.settings).toEqual({ locale: 'en' })
  })
})
