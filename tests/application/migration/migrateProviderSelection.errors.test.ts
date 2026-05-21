/**
 * T-MPS-021 — `migrateProviderSelection`: malformed-record handling.
 *
 * Covers REQ-MPS-005 edge case (spec §10 row 5). The migration must never
 * throw. Per-record validation issues land in `MigrationResult.errors` so
 * the caller can decide whether to discard malformed records. Migration
 * continues with the remaining well-formed entries.
 */
import { describe, it, expect } from 'vitest'
import { migrateProviderSelection } from '@/application/migration/migrateProviderSelection'

describe('migrateProviderSelection — malformed records (REQ-MPS-005)', () => {
  it('captures a malformed transport string and continues with the rest', () => {
    const result = migrateProviderSelection({
      chatThreads: {
        good: {
          threadId: 'good',
          sessionId: null,
          feature: null,
          logPath: 'logs/good.md',
          transport: 'api-key',
          createdAt: '2026-01-01T00:00:00Z',
          lastUsedAt: '2026-01-01T00:00:00Z',
        },
        // `cursor:api` is an impossible legacy string — there was no Cursor
        // adapter when the legacy union was defined. Migration should report
        // and keep going.
        bad: {
          threadId: 'bad',
          sessionId: null,
          feature: null,
          logPath: 'logs/bad.md',
          transport: 'cursor:api',
          createdAt: '2026-01-01T00:00:00Z',
          lastUsedAt: '2026-01-01T00:00:00Z',
        },
      },
    })

    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors.some((e) => e.includes('bad'))).toBe(true)
    const threads = result.data.chatThreads as Record<string, Record<string, unknown>>
    // Good record migrated.
    expect(threads.good.transport).toEqual({ provider: 'claude', mode: 'api' })
    // Bad record is left alone (caller decides whether to drop).
    expect(threads.bad).toBeDefined()
  })

  it('never throws on a record that is not an object', () => {
    expect(() =>
      migrateProviderSelection({
        chatThreads: {
          weird: 'not-an-object' as unknown as Record<string, unknown>,
        },
      }),
    ).not.toThrow()
  })

  it('never throws on a missing settings or chatThreads sub-key', () => {
    expect(() => migrateProviderSelection({})).not.toThrow()
    expect(() => migrateProviderSelection({ settings: {} })).not.toThrow()
    expect(() => migrateProviderSelection({ chatThreads: {} })).not.toThrow()
  })

  it('records an error when a record is missing transport entirely', () => {
    const result = migrateProviderSelection({
      chatThreads: {
        noTransport: {
          threadId: 'noTransport',
          sessionId: null,
          feature: null,
          logPath: 'logs/x.md',
          createdAt: '2026-01-01T00:00:00Z',
          lastUsedAt: '2026-01-01T00:00:00Z',
        },
      },
    })
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('treats a totally invalid transport object as malformed', () => {
    const result = migrateProviderSelection({
      chatThreads: {
        x: {
          threadId: 'x',
          sessionId: null,
          feature: null,
          logPath: 'logs/x.md',
          transport: { provider: 'mistral', mode: 'api' },
          createdAt: '2026-01-01T00:00:00Z',
          lastUsedAt: '2026-01-01T00:00:00Z',
        },
      },
    })
    expect(result.errors.length).toBeGreaterThan(0)
  })
})
