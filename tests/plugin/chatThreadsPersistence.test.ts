/**
 * T-ASM-053 — Tests for plugin-data hydration of `chatThreads`.
 *
 * Covers TEST-ASM-035 (REQ-ASM-037): a `MockBridge` restart with persisted
 * `chatThreads` rehydrates `useChatStore.chatThreads` with all records and
 * `activeThreadId` matches the last-used record.
 *
 * Scope of this file (SPEC §11.3, ADR-0031):
 *   - `decodeChatThreadsBlob` — present / missing / malformed input handling.
 *   - `encodeChatThreadsBlob` — round-trip + degraded-transport filtering.
 *   - `mostRecentlyUsedThreadId` — last-used selection for `activeThreadId`.
 *   - Cross-load idempotency: load → save → load returns the same state.
 *   - Settings + chatThreads coexistence: storing chatThreads doesn't clobber
 *     the existing `_storedData.specorator` PluginSettings keys.
 *   - Pinia hydration: `upsertThread` is called once per record on view open;
 *     `activeThreadId` is seeded from the most-recently-used record.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { getChatStoresFacade } from '../__fakes__/chatStoresFacade'
import { asSessionId } from '@/domain/chat/SessionId'
import type { ChatThreadRecord } from '@/domain/chat/ChatThreadRecord'
import type { LoggerPort } from '@/domain/ports/LoggerPort'
import {
  decodeChatThreadsBlob,
  encodeChatThreadsBlob,
  mostRecentlyUsedThreadId,
  parseChatThreadRecord,
  type SerialisedChatThreadRecord,
} from '@/plugin/chatThreadsPersistence'

function makeLogger(): LoggerPort {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}

function makeRecord(overrides: Partial<ChatThreadRecord> = {}): ChatThreadRecord {
  return {
    threadId: 'thread-1',
    sessionId: asSessionId('sess-1'),
    feature: 'foo',
    logPath: 'specs/foo/sessions/sess-1.md',
    transport: 'subscription',
    createdAt: '2026-05-14T10:00:00.000Z',
    lastUsedAt: '2026-05-14T10:00:00.000Z',
    ...overrides,
  }
}

describe('decodeChatThreadsBlob (T-ASM-053 / REQ-ASM-037)', () => {
  it('returns [] when the blob is undefined (first load: no persisted chatThreads)', () => {
    const logger = makeLogger()
    expect(decodeChatThreadsBlob(undefined, logger)).toEqual([])
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('returns [] when the blob is null with no warn (missing key path)', () => {
    const logger = makeLogger()
    expect(decodeChatThreadsBlob(null, logger)).toEqual([])
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('returns [] and warns when the blob is not an object (e.g. accidental string)', () => {
    const logger = makeLogger()
    expect(decodeChatThreadsBlob('garbage', logger)).toEqual([])
    expect(logger.warn).toHaveBeenCalledTimes(1)
  })

  it('returns [] and warns when the blob is an array (must be a record map)', () => {
    const logger = makeLogger()
    expect(decodeChatThreadsBlob([{ threadId: 'a' }], logger)).toEqual([])
    expect(logger.warn).toHaveBeenCalledTimes(1)
  })

  it('decodes a well-formed blob keyed by threadId into ChatThreadRecord[]', () => {
    const logger = makeLogger()
    const blob: Record<string, SerialisedChatThreadRecord> = {
      'thread-a': {
        threadId: 'thread-a',
        sessionId: 'sess-a',
        feature: 'alpha',
        logPath: 'specs/alpha/sessions/sess-a.md',
        transport: 'subscription',
        createdAt: '2026-05-14T09:00:00.000Z',
        lastUsedAt: '2026-05-14T09:30:00.000Z',
      },
      'thread-b': {
        threadId: 'thread-b',
        sessionId: null,
        feature: null,
        logPath: '.specorator/sessions/thread-b.md',
        transport: 'api-key',
        createdAt: '2026-05-14T10:00:00.000Z',
        lastUsedAt: '2026-05-14T10:05:00.000Z',
      },
    }

    const out = decodeChatThreadsBlob(blob, logger)

    expect(out).toHaveLength(2)
    expect(out[0].threadId).toBe('thread-a')
    expect(out[0].sessionId).toBe('sess-a')
    expect(out[1].threadId).toBe('thread-b')
    expect(out[1].sessionId).toBeNull()
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('drops malformed entries and keeps well-formed ones (filtered + warn per drop)', () => {
    const logger = makeLogger()
    const blob: Record<string, unknown> = {
      'good': {
        threadId: 'good',
        sessionId: 'sess-good',
        feature: 'foo',
        logPath: 'specs/foo/sessions/sess-good.md',
        transport: 'subscription',
        createdAt: '2026-05-14T10:00:00.000Z',
        lastUsedAt: '2026-05-14T10:00:00.000Z',
      },
      'missing-transport': {
        threadId: 'missing-transport',
        sessionId: 'sess-x',
        feature: 'foo',
        logPath: 'specs/foo/sessions/sess-x.md',
        createdAt: '2026-05-14T10:00:00.000Z',
        lastUsedAt: '2026-05-14T10:00:00.000Z',
      },
      'degraded-transport': {
        threadId: 'degraded-transport',
        sessionId: 'sess-d',
        feature: null,
        logPath: '.specorator/sessions/sess-d.md',
        transport: 'degraded',
        createdAt: '2026-05-14T10:00:00.000Z',
        lastUsedAt: '2026-05-14T10:00:00.000Z',
      },
      'missing-logPath': {
        threadId: 'missing-logPath',
        sessionId: null,
        feature: null,
        transport: 'api-key',
        createdAt: '2026-05-14T10:00:00.000Z',
        lastUsedAt: '2026-05-14T10:00:00.000Z',
      },
      'bad-shape': 'not-an-object',
    }

    const out = decodeChatThreadsBlob(blob, logger)

    expect(out).toHaveLength(1)
    expect(out[0].threadId).toBe('good')
    // Four malformed entries → four warn calls.
    expect(logger.warn).toHaveBeenCalledTimes(4)
  })

  it('drops a record with non-null but non-string sessionId', () => {
    const logger = makeLogger()
    const out = decodeChatThreadsBlob(
      { x: { ...makeRecord(), sessionId: 123 } },
      logger,
    )
    expect(out).toEqual([])
    expect(logger.warn).toHaveBeenCalledTimes(1)
  })
})

describe('parseChatThreadRecord (T-ASM-053)', () => {
  it('rejects null', () => {
    const logger = makeLogger()
    expect(parseChatThreadRecord(null, logger)).toBeNull()
    expect(logger.warn).toHaveBeenCalledTimes(1)
  })

  it('rejects a record with empty threadId', () => {
    const logger = makeLogger()
    expect(parseChatThreadRecord({ ...makeRecord(), threadId: '' }, logger)).toBeNull()
    expect(logger.warn).toHaveBeenCalledTimes(1)
  })

  it('rejects a record whose feature is neither null nor string', () => {
    const logger = makeLogger()
    expect(
      parseChatThreadRecord({ ...makeRecord(), feature: 42 }, logger),
    ).toBeNull()
    expect(logger.warn).toHaveBeenCalledTimes(1)
  })
})

describe('encodeChatThreadsBlob (T-ASM-053 / REQ-ASM-037)', () => {
  it('returns the JSON-friendly record-of-records keyed by threadId', () => {
    const r1 = makeRecord({ threadId: 'thread-1' })
    const r2 = makeRecord({ threadId: 'thread-2', transport: 'api-key', sessionId: null })
    const map = new Map<string, ChatThreadRecord>([
      ['thread-1', r1],
      ['thread-2', r2],
    ])

    const out = encodeChatThreadsBlob(map)

    expect(Object.keys(out)).toEqual(['thread-1', 'thread-2'])
    expect(out['thread-1'].sessionId).toBe('sess-1')
    expect(out['thread-2'].sessionId).toBeNull()
  })

  it('filters out degraded-transport records (NOT persisted)', () => {
    const persisted = makeRecord({ threadId: 'keep' })
    // Construct a degraded record via a type-cast to simulate an in-flight
    // value that should never make it to disk.
    const degraded = {
      ...makeRecord({ threadId: 'drop' }),
      transport: 'degraded',
    } as unknown as ChatThreadRecord

    const map = new Map<string, ChatThreadRecord>([
      ['keep', persisted],
      ['drop', degraded],
    ])

    const out = encodeChatThreadsBlob(map)

    expect(Object.keys(out)).toEqual(['keep'])
    expect(out.drop).toBeUndefined()
  })

  it('returns {} for an empty map', () => {
    expect(encodeChatThreadsBlob(new Map())).toEqual({})
  })
})

describe('mostRecentlyUsedThreadId (T-ASM-053 / REQ-ASM-037)', () => {
  it('returns null for an empty list', () => {
    expect(mostRecentlyUsedThreadId([])).toBeNull()
  })

  it('returns the only id when one record is present', () => {
    expect(mostRecentlyUsedThreadId([makeRecord({ threadId: 'only' })])).toBe('only')
  })

  it('returns the id with the largest lastUsedAt timestamp', () => {
    const records = [
      makeRecord({ threadId: 'old',    lastUsedAt: '2026-05-14T09:00:00.000Z' }),
      makeRecord({ threadId: 'newest', lastUsedAt: '2026-05-14T10:00:00.000Z' }),
      makeRecord({ threadId: 'middle', lastUsedAt: '2026-05-14T09:30:00.000Z' }),
    ]
    expect(mostRecentlyUsedThreadId(records)).toBe('newest')
  })
})

describe('cross-load round-trip (T-ASM-053 / REQ-ASM-037)', () => {
  it('save → load returns the same set of records', () => {
    const logger = makeLogger()
    const original = new Map<string, ChatThreadRecord>([
      ['t1', makeRecord({ threadId: 't1', lastUsedAt: '2026-05-14T10:00:00.000Z' })],
      ['t2', makeRecord({ threadId: 't2', lastUsedAt: '2026-05-14T11:00:00.000Z', transport: 'api-key', sessionId: null })],
    ])

    const blob = encodeChatThreadsBlob(original)
    const reloaded = decodeChatThreadsBlob(blob, logger)

    expect(reloaded).toHaveLength(2)
    expect(reloaded.find((r) => r.threadId === 't1')?.sessionId).toBe('sess-1')
    expect(reloaded.find((r) => r.threadId === 't2')?.sessionId).toBeNull()
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('load → save → load is idempotent (no warn, same records)', () => {
    const logger = makeLogger()
    const seed: Record<string, SerialisedChatThreadRecord> = {
      a: {
        threadId: 'a', sessionId: 'sa', feature: 'foo',
        logPath: 'specs/foo/sessions/sa.md', transport: 'subscription',
        createdAt: '2026-05-14T08:00:00.000Z', lastUsedAt: '2026-05-14T09:00:00.000Z',
      },
    }
    const first = decodeChatThreadsBlob(seed, logger)
    const asMap = new Map(first.map((r) => [r.threadId, r]))
    const second = decodeChatThreadsBlob(encodeChatThreadsBlob(asMap), logger)

    expect(second).toEqual(first)
    expect(logger.warn).not.toHaveBeenCalled()
  })
})

describe('pinia hydration (TEST-ASM-035 / REQ-ASM-037)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('hydrates the chatStore by calling upsertThread once per record, order preserved', () => {
    const logger = makeLogger()
    const blob = {
      'old':   { threadId: 'old',   sessionId: 'so', feature: 'foo', logPath: 'specs/foo/sessions/so.md', transport: 'subscription', createdAt: '2026-05-14T08:00:00.000Z', lastUsedAt: '2026-05-14T08:00:00.000Z' },
      'newest':{ threadId: 'newest',sessionId: 'sn', feature: 'foo', logPath: 'specs/foo/sessions/sn.md', transport: 'subscription', createdAt: '2026-05-14T09:00:00.000Z', lastUsedAt: '2026-05-14T10:00:00.000Z' },
    }
    const records = decodeChatThreadsBlob(blob, logger)
    const store = getChatStoresFacade()
    for (const record of records) {
      store.upsertThread(record)
    }
    store.setActiveThreadId(mostRecentlyUsedThreadId(records))

    expect(store.chatThreads.size).toBe(2)
    expect(store.chatThreads.get('old')?.threadId).toBe('old')
    expect(store.chatThreads.get('newest')?.threadId).toBe('newest')
    expect(store.activeThreadId).toBe('newest')
  })

  it('first-load: missing blob leaves chatThreads empty and activeThreadId null', () => {
    const logger = makeLogger()
    const records = decodeChatThreadsBlob(undefined, logger)
    const store = getChatStoresFacade()
    for (const record of records) store.upsertThread(record)
    store.setActiveThreadId(mostRecentlyUsedThreadId(records))

    expect(store.chatThreads.size).toBe(0)
    expect(store.activeThreadId).toBeNull()
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('malformed entries are dropped and well-formed ones land in the store', () => {
    const logger = makeLogger()
    const blob: Record<string, unknown> = {
      good: {
        threadId: 'good', sessionId: 'sg', feature: 'foo',
        logPath: 'specs/foo/sessions/sg.md', transport: 'subscription',
        createdAt: '2026-05-14T10:00:00.000Z', lastUsedAt: '2026-05-14T10:00:00.000Z',
      },
      degraded: {
        threadId: 'degraded', sessionId: 'sd', feature: null,
        logPath: '.specorator/sessions/sd.md', transport: 'degraded',
        createdAt: '2026-05-14T10:00:00.000Z', lastUsedAt: '2026-05-14T10:00:00.000Z',
      },
    }
    const records = decodeChatThreadsBlob(blob, logger)
    const store = getChatStoresFacade()
    for (const record of records) store.upsertThread(record)

    expect(store.chatThreads.size).toBe(1)
    expect(store.chatThreads.get('good')).toBeDefined()
    expect(store.chatThreads.get('degraded')).toBeUndefined()
    expect(logger.warn).toHaveBeenCalledTimes(1)
  })
})

describe('settings + chatThreads coexistence (T-ASM-053 / SPEC §9.3)', () => {
  it('encode → place under specorator.chatThreads preserves sibling PluginSettings keys', () => {
    // Simulate the `_storedData` shape main.ts owns.
    const _storedData: Record<string, unknown> = {
      specorator: {
        locale: 'en',
        specsFolder: 'specs',
        claudeCliPath: '/usr/local/bin/claude',
        transportKind: 'auto',
      },
      _moduleVersions: { hello: 1 },
    }

    const map = new Map<string, ChatThreadRecord>([
      ['t1', {
        threadId: 't1', sessionId: asSessionId('s1'), feature: 'foo',
        logPath: 'specs/foo/sessions/s1.md', transport: 'subscription',
        createdAt: '2026-05-14T10:00:00.000Z', lastUsedAt: '2026-05-14T10:00:00.000Z',
      }],
    ])

    const nextSpecorator: Record<string, unknown> = {
      ...(_storedData.specorator as Record<string, unknown>),
      chatThreads: encodeChatThreadsBlob(map),
    }
    const nextStored: Record<string, unknown> = { ..._storedData, specorator: nextSpecorator }

    // PluginSettings keys preserved.
    expect((nextStored.specorator as Record<string, unknown>).locale).toBe('en')
    expect((nextStored.specorator as Record<string, unknown>).specsFolder).toBe('specs')
    expect((nextStored.specorator as Record<string, unknown>).claudeCliPath).toBe('/usr/local/bin/claude')
    // chatThreads attached as sibling key under specorator.
    expect((nextStored.specorator as Record<string, unknown>).chatThreads).toEqual({
      t1: {
        threadId: 't1', sessionId: 's1', feature: 'foo',
        logPath: 'specs/foo/sessions/s1.md', transport: 'subscription',
        createdAt: '2026-05-14T10:00:00.000Z', lastUsedAt: '2026-05-14T10:00:00.000Z',
      },
    })
    // Other top-level module blobs untouched.
    expect(nextStored._moduleVersions).toEqual({ hello: 1 })
  })
})
