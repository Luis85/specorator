/**
 * T-MPS-019 — `migrateProviderSelection`: chatThreads transport translation.
 *
 * Covers REQ-MPS-005 / TST-MPS-03. The migration must translate every
 * record's legacy string `transport` into the discriminated `{ provider,
 * mode }` object and default missing `title` to `''` and missing
 * `forkParent` to `null`. Already-migrated records (transport is an object)
 * are preserved.
 */
import { describe, it, expect } from 'vitest'
import { migrateProviderSelection } from '@/application/migration/migrateProviderSelection'

describe('migrateProviderSelection — chatThreads.transport translation', () => {
  it.each([
    ['api-key', { provider: 'claude', mode: 'api' }],
    ['subscription', { provider: 'claude', mode: 'cli' }],
  ] as ReadonlyArray<[string, Record<string, unknown>]>)(
    'translates legacy %s to %o',
    (legacy, expected) => {
      const result = migrateProviderSelection({
        chatThreads: {
          t1: {
            threadId: 't1',
            sessionId: null,
            feature: 'foo',
            logPath: 'specs/foo/sessions/t1.md',
            transport: legacy,
            createdAt: '2026-01-01T00:00:00Z',
            lastUsedAt: '2026-01-01T00:00:00Z',
          },
        },
      })

      expect(result.migrated).toBe(true)
      expect(result.errors).toEqual([])
      const thread = (result.data.chatThreads!).t1
      expect(thread.transport).toEqual(expected)
      // Defaults applied to the new fields.
      expect(thread.title).toBe('')
      expect(thread.forkParent).toBeNull()
    },
  )

  it('preserves a record whose transport is already the object shape', () => {
    const before = {
      chatThreads: {
        t1: {
          threadId: 't1',
          sessionId: null,
          feature: null,
          logPath: 'logs/t1.md',
          transport: { provider: 'cursor', mode: 'api' },
          title: 'Existing title',
          forkParent: 't0',
          createdAt: '2026-01-01T00:00:00Z',
          lastUsedAt: '2026-01-01T00:00:00Z',
        },
      },
    }
    const result = migrateProviderSelection(before)
    expect(result.migrated).toBe(false)
    const thread = (result.data.chatThreads!).t1
    expect(thread.transport).toEqual({ provider: 'cursor', mode: 'api' })
    expect(thread.title).toBe('Existing title')
    expect(thread.forkParent).toBe('t0')
  })

  it('fills missing title and forkParent on a record that is otherwise migrated', () => {
    const before = {
      chatThreads: {
        t1: {
          threadId: 't1',
          sessionId: null,
          feature: null,
          logPath: 'logs/t1.md',
          transport: { provider: 'claude', mode: 'api' },
          createdAt: '2026-01-01T00:00:00Z',
          lastUsedAt: '2026-01-01T00:00:00Z',
        },
      },
    }
    const result = migrateProviderSelection(before)
    expect(result.migrated).toBe(true)
    const thread = (result.data.chatThreads!).t1
    expect(thread.title).toBe('')
    expect(thread.forkParent).toBeNull()
  })

  it('translates multiple records in one pass', () => {
    const result = migrateProviderSelection({
      chatThreads: {
        a: {
          threadId: 'a',
          sessionId: null,
          feature: null,
          logPath: 'logs/a.md',
          transport: 'api-key',
          createdAt: '2026-01-01T00:00:00Z',
          lastUsedAt: '2026-01-01T00:00:00Z',
        },
        b: {
          threadId: 'b',
          sessionId: null,
          feature: null,
          logPath: 'logs/b.md',
          transport: 'subscription',
          createdAt: '2026-01-02T00:00:00Z',
          lastUsedAt: '2026-01-02T00:00:00Z',
        },
      },
    })

    expect(result.migrated).toBe(true)
    expect(result.errors).toEqual([])
    const threads = result.data.chatThreads!
    expect(threads.a.transport).toEqual({ provider: 'claude', mode: 'api' })
    expect(threads.b.transport).toEqual({ provider: 'claude', mode: 'cli' })
  })
})
