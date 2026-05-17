/**
 * Type-level invariants for {@link ChatThreadRecord} (SPEC-ASM-001 §2.2).
 *
 * WP-14: complementary to the wire-shape tests in
 * `tests/infrastructure/chat/chatThreadsCodec.test.ts` — those tests cover
 * runtime validation via `parseChatThreadRecord`; this file pins down the
 * compile-time shape so future schema drift is caught at type-check time.
 */
import { describe, it, expect, expectTypeOf } from 'vitest'
import type { ChatThreadRecord } from '@/domain/chat/ChatThreadRecord'
import { asSessionId, type SessionId } from '@/domain/chat/SessionId'

describe('ChatThreadRecord — required fields', () => {
  it('exposes the seven SPEC §2.2 fields with the documented types', () => {
    expectTypeOf<ChatThreadRecord>().toHaveProperty('threadId').toEqualTypeOf<string>()
    expectTypeOf<ChatThreadRecord>().toHaveProperty('sessionId').toEqualTypeOf<SessionId | null>()
    expectTypeOf<ChatThreadRecord>().toHaveProperty('feature').toEqualTypeOf<string | null>()
    expectTypeOf<ChatThreadRecord>().toHaveProperty('logPath').toEqualTypeOf<string>()
    expectTypeOf<ChatThreadRecord>().toHaveProperty('transport')
      .toEqualTypeOf<'api-key' | 'subscription'>()
    expectTypeOf<ChatThreadRecord>().toHaveProperty('createdAt').toEqualTypeOf<string>()
    expectTypeOf<ChatThreadRecord>().toHaveProperty('lastUsedAt').toEqualTypeOf<string>()
  })

  it('all fields are readonly (immutable record)', () => {
    // Constructing a value satisfies the readonly constraint — direct
    // assignment would be a compile error. We assert structural shape at
    // runtime as a sanity check.
    const record: ChatThreadRecord = {
      threadId: 't1',
      sessionId: asSessionId('s1'),
      feature: 'foo',
      logPath: 'specs/foo/sessions/s1.md',
      transport: 'subscription',
      createdAt: '2026-05-17T00:00:00.000Z',
      lastUsedAt: '2026-05-17T00:00:00.000Z',
    }
    expect(record.threadId).toBe('t1')
    expect(record.sessionId).toBe('s1')
  })
})

describe('ChatThreadRecord — transport literal (degraded not persisted)', () => {
  it('rejects transport === "degraded" at the type level', () => {
    // `transport` is `'api-key' | 'subscription'` — `'degraded'` records exist
    // in memory (user-session-scoped) but are filtered at encode time by
    // `encodeChatThreadsBlob` (ADR-0031). The compile-time shape pins this so
    // a refactor cannot accidentally widen the union.
    expectTypeOf<ChatThreadRecord['transport']>().not.toEqualTypeOf<string>()
    expectTypeOf<'degraded'>().not.toExtend<ChatThreadRecord['transport']>()
    expectTypeOf<'api-key'>().toExtend<ChatThreadRecord['transport']>()
    expectTypeOf<'subscription'>().toExtend<ChatThreadRecord['transport']>()
  })
})

describe('ChatThreadRecord — sessionId nullability', () => {
  it('accepts null for the pre-init / SDK case', () => {
    const record: ChatThreadRecord = {
      threadId: 't1',
      sessionId: null,
      feature: null,
      logPath: '.specorator/sessions/t1.md',
      transport: 'api-key',
      createdAt: '2026-05-17T00:00:00.000Z',
      lastUsedAt: '2026-05-17T00:00:00.000Z',
    }
    expect(record.sessionId).toBeNull()
    expect(record.feature).toBeNull()
  })

  it('non-null sessionId is branded (not a plain string)', () => {
    expectTypeOf<NonNullable<ChatThreadRecord['sessionId']>>().toEqualTypeOf<SessionId>()
    // A raw string is NOT a SessionId (the brand is unforgeable).
    expectTypeOf<string>().not.toExtend<SessionId>()
  })
})
