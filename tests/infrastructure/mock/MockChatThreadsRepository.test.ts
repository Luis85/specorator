/**
 * Tests for {@link MockChatThreadsRepository} (WP-14).
 *
 * Asserts the in-memory adapter mirrors the `ChatThreadsRepositoryPort`
 * contract: `save()` is synchronous (no debounce), `load()` returns the
 * persisted snapshot, and seed options work for both Map and Array shapes.
 */
import { describe, it, expect } from 'vitest'
import { asSessionId } from '@/domain/chat/SessionId'
import type { ChatThreadRecord } from '@/domain/chat/ChatThreadRecord'
import { MockChatThreadsRepository } from '@/infrastructure/mock/MockChatThreadsRepository'

function makeRecord(overrides: Partial<ChatThreadRecord> = {}): ChatThreadRecord {
  return {
    threadId: 't1',
    sessionId: asSessionId('sess-1'),
    feature: 'foo',
    logPath: 'specs/foo/sessions/sess-1.md',
    transport: 'subscription',
    createdAt: '2026-05-17T10:00:00.000Z',
    lastUsedAt: '2026-05-17T10:00:00.000Z',
    ...overrides,
  }
}

describe('MockChatThreadsRepository — load/save round-trip', () => {
  it('starts empty when no initial seed is supplied', async () => {
    const repo = new MockChatThreadsRepository()
    const loaded = await repo.load()
    expect(loaded.size).toBe(0)
  })

  it('persists what save() writes; load() returns the saved snapshot', async () => {
    const repo = new MockChatThreadsRepository()
    const map = new Map<string, ChatThreadRecord>([
      ['t1', makeRecord({ threadId: 't1' })],
      ['t2', makeRecord({ threadId: 't2', transport: 'api-key', sessionId: null })],
    ])
    await repo.save(map)
    const loaded = await repo.load()
    expect(loaded.size).toBe(2)
    expect(loaded.get('t1')?.threadId).toBe('t1')
    expect(loaded.get('t2')?.sessionId).toBeNull()
  })

  it('save() is synchronous: snapshot reflects the latest call immediately', async () => {
    const repo = new MockChatThreadsRepository()
    await repo.save(new Map([['t1', makeRecord({ threadId: 't1' })]]))
    await repo.save(
      new Map([
        ['t1', makeRecord({ threadId: 't1' })],
        ['t2', makeRecord({ threadId: 't2', transport: 'api-key', sessionId: null })],
      ]),
    )
    expect(repo.saveCount).toBe(2)
    const snapshot = repo.snapshot()
    expect(Array.from(snapshot.keys()).sort()).toEqual(['t1', 't2'])
  })
})

describe('MockChatThreadsRepository — initial seed', () => {
  it('accepts an initial Map seed', async () => {
    const initial = new Map<string, ChatThreadRecord>([['t1', makeRecord({ threadId: 't1' })]])
    const repo = new MockChatThreadsRepository({ initial })
    const loaded = await repo.load()
    expect(loaded.size).toBe(1)
    expect(loaded.get('t1')?.threadId).toBe('t1')
  })

  it('accepts an initial array seed keyed by threadId', async () => {
    const initial: ChatThreadRecord[] = [
      makeRecord({ threadId: 'a' }),
      makeRecord({ threadId: 'b', transport: 'api-key', sessionId: null }),
    ]
    const repo = new MockChatThreadsRepository({ initial })
    const loaded = await repo.load()
    expect(loaded.size).toBe(2)
    expect(loaded.get('a')?.threadId).toBe('a')
    expect(loaded.get('b')?.transport).toBe('api-key')
  })
})

describe('MockChatThreadsRepository — defensive copies', () => {
  it('load() returns a fresh Map that mutating does not affect the store', async () => {
    const repo = new MockChatThreadsRepository({
      initial: new Map([['t1', makeRecord({ threadId: 't1' })]]),
    })
    const loaded = await repo.load()
    // Mutate the returned map (cast to writable to defeat the type guard).
    ;(loaded as Map<string, ChatThreadRecord>).delete('t1')
    const reloaded = await repo.load()
    // Internal store is untouched.
    expect(reloaded.size).toBe(1)
    expect(reloaded.get('t1')?.threadId).toBe('t1')
  })

  it('snapshot() returns a fresh Map distinct from load()', async () => {
    const repo = new MockChatThreadsRepository()
    await repo.save(new Map([['t1', makeRecord({ threadId: 't1' })]]))
    const a = repo.snapshot()
    const b = await repo.load()
    expect(a).not.toBe(b)
    expect(a.get('t1')?.threadId).toBe('t1')
    expect(b.get('t1')?.threadId).toBe('t1')
  })
})
