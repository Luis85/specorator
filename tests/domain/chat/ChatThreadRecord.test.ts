/**
 * T-MPS-016 — `ChatThreadRecord` extended shape contract.
 *
 * Covers REQ-MPS-005, REQ-MPS-020, REQ-MPS-021, REQ-MPS-023. The extended
 * record carries `title` (default `''`), `forkParent` (default `null`), and
 * a discriminated `transport: { provider, mode }` object instead of the
 * legacy `'api-key' | 'subscription'` string. Per SPEC-MPS-001 §2.6.
 */
import { describe, it, expect, expectTypeOf } from 'vitest'
import type { ChatThreadRecord } from '@/domain/chat/ChatThreadRecord'
import type {
  ProviderId,
  ProviderMode,
} from '@/domain/chat/ProviderSelection'
import { asSessionId } from '@/domain/chat/SessionId'

describe('ChatThreadRecord extended shape (REQ-MPS-005)', () => {
  it('accepts the new transport object plus title and forkParent', () => {
    const record: ChatThreadRecord = {
      threadId: 't1',
      sessionId: asSessionId('s1'),
      feature: 'demo',
      logPath: 'logs/t1.md',
      transport: { provider: 'claude', mode: 'api' },
      title: 'Initial conversation',
      forkParent: null,
      createdAt: '2026-01-01T00:00:00Z',
      lastUsedAt: '2026-01-02T00:00:00Z',
    }
    expect(record.transport.provider).toBe('claude')
    expect(record.transport.mode).toBe('api')
    expect(record.title).toBe('Initial conversation')
    expect(record.forkParent).toBeNull()
  })

  it('allows forkParent to reference another thread id', () => {
    const child: ChatThreadRecord = {
      threadId: 't2',
      sessionId: null,
      feature: null,
      logPath: 'logs/t2.md',
      transport: { provider: 'cursor', mode: 'cli' },
      title: '',
      forkParent: 't1',
      createdAt: '2026-01-03T00:00:00Z',
      lastUsedAt: '2026-01-03T00:00:00Z',
    }
    expect(child.forkParent).toBe('t1')
  })

  it('compile-time: transport is the discriminated object shape', () => {
    expectTypeOf<ChatThreadRecord['transport']>().toEqualTypeOf<{
      readonly provider: ProviderId
      readonly mode: ProviderMode
    }>()
  })

  it('compile-time: title is a required string and forkParent is string|null', () => {
    expectTypeOf<ChatThreadRecord['title']>().toEqualTypeOf<string>()
    expectTypeOf<ChatThreadRecord['forkParent']>().toEqualTypeOf<string | null>()
  })

  it('compile-time: the legacy transport string is no longer assignable', () => {
    // @ts-expect-error — legacy 'api-key' string is not a valid transport
    const bad: ChatThreadRecord['transport'] = 'api-key'
    // Reference `bad` to keep TS from eliding the assignment.
    expect(bad).toBeDefined()
  })
})
