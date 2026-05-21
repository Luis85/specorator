/**
 * T-MPS-020 — `migrateProviderSelection`: idempotency.
 *
 * Covers NFR-MPS-006 / TST-MPS-02. Running the migration twice on the same
 * input must produce the same output, and the second pass must report
 * `migrated === false`. The function must be a true fixed-point operator
 * (no further transformation possible).
 */
import { describe, it, expect } from 'vitest'
import { migrateProviderSelection } from '@/application/migration/migrateProviderSelection'

describe('migrateProviderSelection — idempotency (NFR-MPS-006)', () => {
  const fixtures = [
    {
      label: 'legacy settings.transportKind = auto',
      input: { settings: { transportKind: 'auto' } },
    },
    {
      label: 'legacy settings.transportKind = subscription',
      input: { settings: { transportKind: 'subscription' } },
    },
    {
      label: 'legacy chatThreads.transport string',
      input: {
        chatThreads: {
          t1: {
            threadId: 't1',
            sessionId: null,
            feature: null,
            logPath: 'logs/t1.md',
            transport: 'api-key',
            createdAt: '2026-01-01T00:00:00Z',
            lastUsedAt: '2026-01-01T00:00:00Z',
          },
        },
      },
    },
  ]

  it.each(fixtures)('$label — second pass reports migrated === false', ({ input }) => {
    const first = migrateProviderSelection(input)
    expect(first.migrated).toBe(true)
    const second = migrateProviderSelection(first.data)
    expect(second.migrated).toBe(false)
    expect(second.errors).toEqual([])
  })

  it.each(fixtures)('$label — second pass yields equal data', ({ input }) => {
    const first = migrateProviderSelection(input)
    const second = migrateProviderSelection(first.data)
    expect(second.data).toEqual(first.data)
  })

  it('an empty input is a no-op', () => {
    const result = migrateProviderSelection({})
    expect(result.migrated).toBe(false)
    expect(result.errors).toEqual([])
    expect(result.data).toEqual({})
  })

  it('a fully-migrated input is a no-op', () => {
    const input = {
      settings: { providerSelection: { forced: 'auto' as const } },
      chatThreads: {
        t1: {
          threadId: 't1',
          sessionId: null,
          feature: null,
          logPath: 'logs/t1.md',
          transport: { provider: 'claude', mode: 'api' },
          title: '',
          forkParent: null,
          createdAt: '2026-01-01T00:00:00Z',
          lastUsedAt: '2026-01-01T00:00:00Z',
        },
      },
    }
    const result = migrateProviderSelection(input)
    expect(result.migrated).toBe(false)
    expect(result.errors).toEqual([])
  })
})
