/**
 * Tests for {@link ObsidianChatThreadsRepository} (WP-14).
 *
 * Asserts the production adapter preserves the persistence semantics
 * previously hosted by `SpecoratorPlugin.scheduleChatThreadsPersistence`:
 *   - `load()` decodes the blob under `_storedData.specorator.chatThreads`.
 *   - `save()` debounces (1 s default) and coalesces rapid mutations.
 *   - Writes preserve every sibling key under `specorator.*` (SPEC §9.3).
 *   - Degraded-transport records are filtered at encode time.
 *   - Flushes are serialised: an older snapshot cannot resolve after a
 *     newer one (Codex P1, PR #350).
 *   - `flushPending()` drains the latest pending snapshot synchronously
 *     so onunload-time writes survive plugin reload (Codex P1, PR #346).
 *
 * The tests route `setActiveTimeout`/`clearActiveTimeout` through the
 * standard `setTimeout`/`clearTimeout` because there is no Obsidian
 * `activeWindow` in the vitest environment; production wires them through
 * `activeWindow` (see `src/plugin/main.ts`). The obsidianmd timer/doc
 * lint rules are disabled in this test scope only.
 */
/* eslint-disable obsidianmd/prefer-active-window-timers, obsidianmd/prefer-active-doc */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { asSessionId } from '@/domain/chat/SessionId'
import type { ChatThreadRecord } from '@/domain/chat/ChatThreadRecord'
import type { LoggerPort } from '@/domain/ports/LoggerPort'
import {
  ObsidianChatThreadsRepository,
  type ObsidianPluginDataHost,
} from '@/infrastructure/obsidian/ObsidianChatThreadsRepository'

interface HarnessState {
  blob: Record<string, unknown> | null
  saveCount: number
}

interface Harness {
  readonly state: HarnessState
  readonly host: ObsidianPluginDataHost
  readonly repo: ObsidianChatThreadsRepository
}

function silentLogger(): LoggerPort {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}

function makeHarness(initial: Record<string, unknown> | null = null): Harness {
  const state: HarnessState = { blob: initial, saveCount: 0 }
  const host: ObsidianPluginDataHost = {
    loadData: vi.fn(async () => state.blob),
    saveData: vi.fn(async (data: Record<string, unknown>) => {
      state.blob = data
      state.saveCount += 1
    }),
    setActiveTimeout: (cb, ms) => setTimeout(cb, ms) as unknown as number,
    clearActiveTimeout: (id) => { clearTimeout(id) },
  }
  const repo = new ObsidianChatThreadsRepository(host, silentLogger())
  return { state, host, repo }
}

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

describe('ObsidianChatThreadsRepository.load', () => {
  it('returns an empty map when no plugin data has been written', async () => {
    const { repo } = makeHarness(null)
    const loaded = await repo.load()
    expect(loaded.size).toBe(0)
  })

  it('returns an empty map when the chatThreads sub-key is missing', async () => {
    const { repo } = makeHarness({ specorator: { locale: 'en' } })
    const loaded = await repo.load()
    expect(loaded.size).toBe(0)
  })

  it('decodes a well-formed blob under specorator.chatThreads', async () => {
    const { repo } = makeHarness({
      specorator: {
        chatThreads: {
          t1: {
            threadId: 't1', sessionId: 's1', feature: 'foo',
            logPath: 'specs/foo/sessions/s1.md', transport: 'subscription',
            createdAt: '2026-05-17T08:00:00.000Z',
            lastUsedAt: '2026-05-17T09:00:00.000Z',
          },
        },
      },
    })
    const loaded = await repo.load()
    expect(loaded.size).toBe(1)
    expect(loaded.get('t1')?.threadId).toBe('t1')
    expect(loaded.get('t1')?.sessionId).toBe('s1')
  })

  it('returns an empty map when stored data is non-object (defensive)', async () => {
    const { repo, host } = makeHarness()
    ;(host.loadData as ReturnType<typeof vi.fn>).mockResolvedValueOnce('not-an-object')
    const loaded = await repo.load()
    expect(loaded.size).toBe(0)
  })
})

describe('ObsidianChatThreadsRepository.save — debounced flush', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('writes a single blob after the 1 s debounce window expires', async () => {
    const { state, repo } = makeHarness({ specorator: { locale: 'en' } })
    await repo.save(new Map([['t1', makeRecord({ threadId: 't1' })]]))
    expect(state.saveCount).toBe(0)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(state.saveCount).toBe(1)
    const specorator = state.blob?.specorator as Record<string, unknown>
    expect(specorator.chatThreads).toEqual({
      t1: {
        threadId: 't1', sessionId: 'sess-1', feature: 'foo',
        logPath: 'specs/foo/sessions/sess-1.md', transport: 'subscription',
        createdAt: '2026-05-17T10:00:00.000Z', lastUsedAt: '2026-05-17T10:00:00.000Z',
      },
    })
  })

  it('coalesces rapid mutations into one flush', async () => {
    const { state, repo } = makeHarness({ specorator: {} })
    await repo.save(new Map([['t1', makeRecord({ threadId: 't1' })]]))
    await repo.save(new Map([['t1', makeRecord({ threadId: 't1' })]]))
    await repo.save(
      new Map([
        ['t1', makeRecord({ threadId: 't1' })],
        ['t2', makeRecord({ threadId: 't2', transport: 'api-key', sessionId: null })],
      ]),
    )
    await vi.advanceTimersByTimeAsync(1_000)
    expect(state.saveCount).toBe(1)
    const specorator = state.blob?.specorator as Record<string, unknown>
    const chatThreads = specorator.chatThreads as Record<string, unknown>
    expect(Object.keys(chatThreads).sort()).toEqual(['t1', 't2'])
  })

  it('preserves sibling specorator keys (SPEC §9.3 coexistence)', async () => {
    const { state, repo } = makeHarness({
      specorator: {
        locale: 'en',
        specsFolder: 'specs',
        claudeCliPath: '/usr/local/bin/claude',
        transportKind: 'auto',
      },
      _moduleVersions: { hello: 1 },
      hello: { showBadge: true },
    })
    await repo.save(new Map([['t1', makeRecord({ threadId: 't1' })]]))
    await vi.advanceTimersByTimeAsync(1_000)
    const specorator = state.blob?.specorator as Record<string, unknown>
    expect(specorator.locale).toBe('en')
    expect(specorator.specsFolder).toBe('specs')
    expect(specorator.claudeCliPath).toBe('/usr/local/bin/claude')
    expect(specorator.transportKind).toBe('auto')
    expect(state.blob?._moduleVersions).toEqual({ hello: 1 })
    expect(state.blob?.hello).toEqual({ showBadge: true })
  })

  it('filters degraded-transport records at flush time', async () => {
    const { state, repo } = makeHarness({ specorator: {} })
    const persisted = makeRecord({ threadId: 'keep', transport: 'subscription' })
    const degraded = {
      ...makeRecord({ threadId: 'drop' }),
      transport: 'degraded',
    } as unknown as ChatThreadRecord
    await repo.save(
      new Map<string, ChatThreadRecord>([
        ['keep', persisted],
        ['drop', degraded],
      ]),
    )
    await vi.advanceTimersByTimeAsync(1_000)
    const specorator = state.blob?.specorator as Record<string, unknown>
    const chatThreads = specorator.chatThreads as Record<string, unknown>
    expect(Object.keys(chatThreads)).toEqual(['keep'])
    expect(chatThreads.drop).toBeUndefined()
  })

  it('honours a custom debounceMs option', async () => {
    const state: HarnessState = { blob: { specorator: {} }, saveCount: 0 }
    const host: ObsidianPluginDataHost = {
      loadData: vi.fn(async () => state.blob),
      saveData: vi.fn(async (d: Record<string, unknown>) => {
        state.blob = d
        state.saveCount += 1
      }),
      setActiveTimeout: (cb, ms) => globalThis.setTimeout(cb, ms) as unknown as number,
      clearActiveTimeout: (id) => { globalThis.clearTimeout(id) },
    }
    const repo = new ObsidianChatThreadsRepository(host, silentLogger(), { debounceMs: 50 })
    await repo.save(new Map([['t1', makeRecord({ threadId: 't1' })]]))
    await vi.advanceTimersByTimeAsync(40)
    expect(state.saveCount).toBe(0)
    await vi.advanceTimersByTimeAsync(20)
    expect(state.saveCount).toBe(1)
  })
})

describe('ObsidianChatThreadsRepository.flushPending', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('drains a pending snapshot before the debounce timer fires', async () => {
    const { state, repo } = makeHarness({ specorator: {} })
    await repo.save(new Map([['just-sent', makeRecord({ threadId: 'just-sent' })]]))
    await vi.advanceTimersByTimeAsync(500)
    expect(state.blob).toEqual({ specorator: {} })
    await repo.flushPending()
    const specorator = state.blob?.specorator as Record<string, unknown>
    const chatThreads = specorator.chatThreads as Record<string, unknown>
    expect(Object.keys(chatThreads)).toEqual(['just-sent'])
  })

  it('is a no-op when nothing is pending', async () => {
    const { state, repo } = makeHarness({ specorator: { locale: 'en' } })
    await repo.flushPending()
    expect(state.saveCount).toBe(0)
  })
})

describe('ObsidianChatThreadsRepository — serialised flush queue (Codex P1)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('queues a newer snapshot behind an in-flight older one', async () => {
    const state: HarnessState = { blob: { specorator: {} }, saveCount: 0 }
    const writeOrder: string[] = []
    const resolvers: Array<() => void> = []
    const host: ObsidianPluginDataHost = {
      loadData: vi.fn(async () => state.blob),
      saveData: vi.fn(async (data: Record<string, unknown>) => {
        const specorator = (data.specorator ?? {}) as Record<string, unknown>
        const threads = (specorator.chatThreads ?? {}) as Record<string, unknown>
        const ids = Object.keys(threads).sort().join(',')
        writeOrder.push(`start:${ids}`)
        await new Promise<void>((resolve) => resolvers.push(resolve))
        writeOrder.push(`finish:${ids}`)
        state.blob = data
        state.saveCount += 1
      }),
      setActiveTimeout: (cb, ms) => globalThis.setTimeout(cb, ms) as unknown as number,
      clearActiveTimeout: (id) => { globalThis.clearTimeout(id) },
    }
    const repo = new ObsidianChatThreadsRepository(host, silentLogger())

    await repo.save(new Map([['t1', makeRecord({ threadId: 't1' })]]))
    await vi.advanceTimersByTimeAsync(1_000)
    // A has started; saveData is parked on its resolver.
    expect(writeOrder).toEqual(['start:t1'])

    await repo.save(
      new Map([
        ['t1', makeRecord({ threadId: 't1' })],
        ['t2', makeRecord({ threadId: 't2', transport: 'api-key', sessionId: null })],
      ]),
    )
    await vi.advanceTimersByTimeAsync(1_000)
    // B is queued behind A — has not started yet.
    expect(writeOrder).toEqual(['start:t1'])

    resolvers[0]?.()
    await vi.runAllTimersAsync()
    await Promise.resolve()
    await Promise.resolve()
    expect(writeOrder).toContain('finish:t1')
    expect(writeOrder.find((s) => s.startsWith('start:t1,t2'))).toBe('start:t1,t2')

    resolvers[1]?.()
    await vi.runAllTimersAsync()
    await Promise.resolve()
    await Promise.resolve()
    expect(writeOrder).toEqual([
      'start:t1',
      'finish:t1',
      'start:t1,t2',
      'finish:t1,t2',
    ])
  })
})

/**
 * Codex P1, PR #408 — `load()` must return the in-memory pending snapshot
 * when a debounced write is still in flight. Otherwise reopening a view
 * inside the debounce window rehydrates pre-save threads and the next
 * `save()` from the store would persist that stale view, silently dropping
 * just-created threads.
 */
describe('ObsidianChatThreadsRepository.load — pending-snapshot precedence (Codex P1)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the in-flight snapshot while a debounced write is pending', async () => {
    const { repo } = makeHarness({
      specorator: {
        chatThreads: {
          stale: {
            threadId: 'stale', sessionId: 'sess-stale', feature: 'foo',
            logPath: 'specs/foo/sessions/sess-stale.md', transport: 'subscription',
            createdAt: '2026-05-17T08:00:00.000Z',
            lastUsedAt: '2026-05-17T08:00:00.000Z',
          },
        },
      },
    })
    await repo.save(
      new Map([
        ['just-sent', makeRecord({ threadId: 'just-sent' })],
      ]),
    )
    // Debounce timer has NOT fired yet — disk still has the stale blob.
    await vi.advanceTimersByTimeAsync(500)
    const loaded = await repo.load()
    expect(Array.from(loaded.keys())).toEqual(['just-sent'])
    expect(loaded.get('stale')).toBeUndefined()
  })

  it('reverts to disk after the pending snapshot has been flushed', async () => {
    const { state, repo } = makeHarness({ specorator: {} })
    await repo.save(new Map([['t1', makeRecord({ threadId: 't1' })]]))
    await vi.advanceTimersByTimeAsync(1_000)
    // Wait for any queued microtasks chained onto the flush queue.
    await Promise.resolve()
    await Promise.resolve()
    expect(state.saveCount).toBe(1)
    const loaded = await repo.load()
    expect(Array.from(loaded.keys())).toEqual(['t1'])
  })

  it('returns a defensive copy so mutating the result does not corrupt the pending snapshot', async () => {
    const { repo } = makeHarness({ specorator: {} })
    await repo.save(new Map([['t1', makeRecord({ threadId: 't1' })]]))
    await vi.advanceTimersByTimeAsync(500)
    const loaded = await repo.load()
    expect(loaded.size).toBe(1)
    // Caller-side delete must not leak into the pending snapshot.
    ;(loaded as Map<string, ChatThreadRecord>).delete('t1')
    const reloaded = await repo.load()
    expect(reloaded.size).toBe(1)
    expect(reloaded.has('t1')).toBe(true)
  })
})

/**
 * Codex P1, PR #408 — after each successful disk write the adapter must
 * notify the host plugin so its `_storedData` cache mirrors the new
 * `chatThreads` blob. Without this, a later `updateSettings(...)` call
 * that persists from the cache would silently re-emit the stale pre-chat
 * snapshot, destroying recent threads.
 */
describe('ObsidianChatThreadsRepository — onChatThreadsPersisted hook (Codex P1)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('reproduces the data-loss path when the host cache is NOT synced', async () => {
    // Simulates the broken wiring: host cache is never updated, so a later
    // settings-style write re-emits the stale snapshot and clobbers
    // chat-threads on disk. The assertion below is what fails on `develop`
    // before this PR and what the synced cache (next test) prevents.
    const state: HarnessState = { blob: { specorator: { chatThreads: {} } }, saveCount: 0 }
    const hostCache: { stored: Record<string, unknown> } = { stored: { specorator: { chatThreads: {} } } }
    const host: ObsidianPluginDataHost = {
      loadData: vi.fn(async () => state.blob),
      saveData: vi.fn(async (data: Record<string, unknown>) => {
        state.blob = data
        state.saveCount += 1
      }),
      setActiveTimeout: (cb, ms) => globalThis.setTimeout(cb, ms) as unknown as number,
      clearActiveTimeout: (id) => { globalThis.clearTimeout(id) },
    }
    // Note: no onChatThreadsPersisted hook configured.
    const repo = new ObsidianChatThreadsRepository(host, silentLogger())
    await repo.save(new Map([['t1', makeRecord({ threadId: 't1' })]]))
    await vi.advanceTimersByTimeAsync(1_000)
    // Disk now has the chat thread.
    const specorator = state.blob?.specorator as Record<string, unknown>
    expect(specorator.chatThreads).toHaveProperty('t1')
    // The host's in-memory cache still has the empty chatThreads — a later
    // settings save would write THAT back and destroy the thread.
    expect((hostCache.stored.specorator as Record<string, unknown>).chatThreads).toEqual({})
  })

  it('mirrors the encoded chatThreads into the host cache after a successful flush', async () => {
    const state: HarnessState = { blob: { specorator: { locale: 'en' } }, saveCount: 0 }
    const hostCache: { stored: Record<string, unknown> } = {
      stored: { specorator: { locale: 'en' } },
    }
    const host: ObsidianPluginDataHost = {
      loadData: vi.fn(async () => state.blob),
      saveData: vi.fn(async (data: Record<string, unknown>) => {
        state.blob = data
        state.saveCount += 1
      }),
      setActiveTimeout: (cb, ms) => globalThis.setTimeout(cb, ms) as unknown as number,
      clearActiveTimeout: (id) => { globalThis.clearTimeout(id) },
    }
    const repo = new ObsidianChatThreadsRepository(host, silentLogger(), {
      onChatThreadsPersisted: (chatThreads) => {
        const currentSpec = (hostCache.stored.specorator ?? {}) as Record<string, unknown>
        hostCache.stored = {
          ...hostCache.stored,
          specorator: { ...currentSpec, chatThreads },
        }
      },
    })
    await repo.save(new Map([['t1', makeRecord({ threadId: 't1' })]]))
    await vi.advanceTimersByTimeAsync(1_000)
    await Promise.resolve()
    await Promise.resolve()
    const mirrored = (hostCache.stored.specorator as Record<string, unknown>).chatThreads as Record<string, unknown>
    expect(mirrored).toHaveProperty('t1')
    // Sibling keys preserved.
    expect((hostCache.stored.specorator as Record<string, unknown>).locale).toBe('en')
  })

  it('does NOT invoke the hook when saveData rejects (cache must stay clean)', async () => {
    const state: HarnessState = { blob: { specorator: {} }, saveCount: 0 }
    const hookSeen: Array<Record<string, unknown>> = []
    const host: ObsidianPluginDataHost = {
      loadData: vi.fn(async () => state.blob),
      saveData: vi.fn(async () => {
        throw new Error('disk full')
      }),
      setActiveTimeout: (cb, ms) => globalThis.setTimeout(cb, ms) as unknown as number,
      clearActiveTimeout: (id) => { globalThis.clearTimeout(id) },
    }
    const repo = new ObsidianChatThreadsRepository(host, silentLogger(), {
      onChatThreadsPersisted: (chatThreads) => { hookSeen.push(chatThreads) },
    })
    // Use flushPending() to obtain a handle on the queue tail so we can
    // await its rejection deterministically without an unhandled-rejection
    // event escaping the runner. The .catch swallow on the returned
    // promise mirrors how `Plugin.onunload()` fires-and-forgets the flush.
    await repo.save(new Map([['t1', makeRecord({ threadId: 't1' })]]))
    await repo.flushPending().catch(() => undefined)
    expect(hookSeen).toEqual([])
    // Disk write was attempted (and rejected) — saveData fires exactly once.
    expect((host.saveData as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)
  })

  it('end-to-end: pending-snapshot precedence + cache sync close the data-loss race', async () => {
    // Reproduces the full sequence from the Codex finding:
    //   1. user sends a chat message → repo.save() debounces
    //   2. user reopens the view inside the debounce → repo.load() must
    //      return the in-flight snapshot, NOT the stale disk copy
    //   3. debounce fires → disk + host cache both updated
    //   4. later updateSettings persists from host cache → must include
    //      the latest chatThreads
    const state: HarnessState = { blob: { specorator: {} }, saveCount: 0 }
    let storedDataCache: Record<string, unknown> = {}
    const host: ObsidianPluginDataHost = {
      loadData: vi.fn(async () => state.blob),
      saveData: vi.fn(async (data: Record<string, unknown>) => {
        state.blob = data
        state.saveCount += 1
      }),
      setActiveTimeout: (cb, ms) => globalThis.setTimeout(cb, ms) as unknown as number,
      clearActiveTimeout: (id) => { globalThis.clearTimeout(id) },
    }
    const repo = new ObsidianChatThreadsRepository(host, silentLogger(), {
      onChatThreadsPersisted: (chatThreads) => {
        const currentSpec = (storedDataCache.specorator ?? {}) as Record<string, unknown>
        storedDataCache = {
          ...storedDataCache,
          specorator: { ...currentSpec, chatThreads },
        }
      },
    })

    // 1. save the new thread (debounce starts)
    await repo.save(new Map([['t1', makeRecord({ threadId: 't1' })]]))
    // 2. view reopens inside debounce — load must return in-flight snapshot
    const midWindow = await repo.load()
    expect(midWindow.has('t1')).toBe(true)
    // 3. debounce fires → host cache mirrored
    await vi.advanceTimersByTimeAsync(1_000)
    await Promise.resolve()
    await Promise.resolve()
    const mirroredThreads = (storedDataCache.specorator as Record<string, unknown>).chatThreads as Record<string, unknown>
    expect(mirroredThreads).toHaveProperty('t1')
    // 4. simulate updateSettings persisting from cache — chatThreads survives
    expect(mirroredThreads.t1).toBeDefined()
  })
})
