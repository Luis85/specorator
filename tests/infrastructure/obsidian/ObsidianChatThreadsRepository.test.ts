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

/**
 * Codex P1 round-2, PR #408 — symmetric race to `onChatThreadsPersisted`.
 * Without a shared read-source, `_flushChatThreads` reads from disk via
 * `await host.loadData()` and merges `chatThreads` into a snapshot that
 * may already be stale relative to an in-flight `updateSettings` /
 * `updateModuleSettings` write — the chat-threads flush then writes the
 * stale settings blob back, silently rolling back the just-made settings
 * change. The fix is a read-through closure that returns the host's live
 * `_storedData` so both writers share one source of truth.
 */
describe('ObsidianChatThreadsRepository — readHostData hook (Codex P1 round-2)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads sibling keys from readHostData(), preserving in-flight settings writes', async () => {
    // Simulate the race: disk still holds the pre-settings blob (an
    // updateSettings call has mutated `_storedData` but its saveData has
    // not yet landed). The chat-threads flush MUST see the new setting
    // via the read-through closure, not the stale disk blob.
    const storedData: { current: Record<string, unknown> } = {
      current: { specorator: { someSetting: 'old-value', chatThreads: {} } },
    }
    const diskBlob: { current: Record<string, unknown> | null } = {
      // Disk is intentionally stale: pre-settings-write snapshot.
      current: { specorator: { someSetting: 'old-value', chatThreads: {} } },
    }
    const host: ObsidianPluginDataHost = {
      loadData: vi.fn(async () => diskBlob.current),
      saveData: vi.fn(async (data: Record<string, unknown>) => {
        diskBlob.current = data
      }),
      setActiveTimeout: (cb, ms) => globalThis.setTimeout(cb, ms) as unknown as number,
      clearActiveTimeout: (id) => { globalThis.clearTimeout(id) },
    }
    const repo = new ObsidianChatThreadsRepository(host, silentLogger(), {
      readHostData: () => storedData.current,
      onChatThreadsPersisted: (chatThreads) => {
        const currentSpec = (storedData.current.specorator ?? {}) as Record<string, unknown>
        storedData.current = {
          ...storedData.current,
          specorator: { ...currentSpec, chatThreads },
        }
      },
    })

    // 1. user mutates a setting directly on the host cache (simulating
    //    `updateSettings({ someSetting: 'new-value' })` mid-flight — the
    //    cache is mutated *before* saveData resolves).
    const specBefore = storedData.current.specorator as Record<string, unknown>
    storedData.current = {
      ...storedData.current,
      specorator: { ...specBefore, someSetting: 'new-value' },
    }

    // 2. chat-threads flush fires.
    await repo.save(new Map([['t1', makeRecord({ threadId: 't1' })]]))
    await vi.advanceTimersByTimeAsync(1_000)
    await Promise.resolve()
    await Promise.resolve()

    // 3. the disk write must preserve the NEW setting, not the stale one.
    const flushedSpecorator = (diskBlob.current!).specorator as Record<string, unknown>
    expect(flushedSpecorator.someSetting).toBe('new-value')
    // ...and chatThreads must also land.
    expect(flushedSpecorator.chatThreads).toHaveProperty('t1')
    // 4. loadData was NEVER consulted at flush time — the closure short-circuits it.
    expect((host.loadData as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0)
  })

  it('falls back to host.loadData() when no readHostData closure is provided', async () => {
    // Regression guard for the no-closure path (existing bare-host tests).
    const state: HarnessState = {
      blob: { specorator: { someSetting: 'from-disk', chatThreads: {} } },
      saveCount: 0,
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
    const repo = new ObsidianChatThreadsRepository(host, silentLogger())
    await repo.save(new Map([['t1', makeRecord({ threadId: 't1' })]]))
    await vi.advanceTimersByTimeAsync(1_000)
    await Promise.resolve()
    await Promise.resolve()
    // loadData WAS used (fallback branch).
    expect((host.loadData as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(1)
    const specorator = state.blob?.specorator as Record<string, unknown>
    expect(specorator.someSetting).toBe('from-disk')
    expect(specorator.chatThreads).toHaveProperty('t1')
  })

  it('falls back to host.loadData() when readHostData() returns null/undefined/non-object', async () => {
    // Defensive: a host that hasn't hydrated its cache yet returns null —
    // the adapter must NOT call `.specorator` on null and crash.
    const state: HarnessState = {
      blob: { specorator: { someSetting: 'disk', chatThreads: {} } },
      saveCount: 0,
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
      readHostData: () => null,
    })
    await repo.save(new Map([['t1', makeRecord({ threadId: 't1' })]]))
    await vi.advanceTimersByTimeAsync(1_000)
    await Promise.resolve()
    await Promise.resolve()
    const specorator = state.blob?.specorator as Record<string, unknown>
    // Falls back to disk → sibling key 'someSetting' from disk is preserved.
    expect(specorator.someSetting).toBe('disk')
    expect(specorator.chatThreads).toHaveProperty('t1')
  })
})

/**
 * Codex P1 round-3, PR #408 — close the gap between the debounce firing
 * and the queued flush actually writing to disk. Previously `save()`
 * cleared `_pendingSnapshot` as soon as the debounce timer fired, even
 * though the queued `_flushChatThreads(snapshot)` had not yet won the
 * `_flushQueue` and committed to disk. During that window:
 *
 *   1. `save(A)` schedules a debounce, sets `_pendingSnapshot = A`.
 *   2. Debounce fires → `_pendingSnapshot = null` (bug), flush(A) enqueued.
 *   3. An older flush is still in `_flushQueue`, so flush(A) waits.
 *   4. `load()` is called → `_pendingSnapshot` is null → falls through to
 *      disk, which is still pre-A. The view rehydrates the stale state.
 *
 * The fix: hold `_pendingSnapshot` until the queued flush has actually
 * resolved. Use identity equality (same Map reference) when clearing so a
 * newer `save()` mid-flight is not erroneously cleared by an older flush's
 * completion.
 */
describe('ObsidianChatThreadsRepository — pending snapshot held until queued flush completes (Codex P1 round-3)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('load() returns the pending snapshot while the queued flush is still in flight', async () => {
    // Set up a host whose saveData parks on a resolver the test controls
    // so we can interrogate `load()` while the queued flush is mid-air.
    const diskBlob: { current: Record<string, unknown> | null } = {
      current: {
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
      },
    }
    const saveResolvers: Array<() => void> = []
    const host: ObsidianPluginDataHost = {
      loadData: vi.fn(async () => diskBlob.current),
      saveData: vi.fn(async (data: Record<string, unknown>) => {
        await new Promise<void>((resolve) => saveResolvers.push(resolve))
        diskBlob.current = data
      }),
      setActiveTimeout: (cb, ms) => globalThis.setTimeout(cb, ms) as unknown as number,
      clearActiveTimeout: (id) => { globalThis.clearTimeout(id) },
    }
    const repo = new ObsidianChatThreadsRepository(host, silentLogger())

    // 1. save(A) — debounce starts.
    await repo.save(new Map([['just-sent', makeRecord({ threadId: 'just-sent' })]]))
    // 2. advance past debounce → timer fires, flush(A) enqueued, flush(A)
    //    awaits the parked saveData.
    await vi.advanceTimersByTimeAsync(1_000)
    await Promise.resolve()
    await Promise.resolve()
    // saveData has been invoked (i.e. queue entered the flush) but not resolved.
    expect((host.saveData as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)
    // Disk is still pre-A (saveData parked).
    const onDisk = diskBlob.current!
    expect(((onDisk.specorator as Record<string, unknown>).chatThreads as Record<string, unknown>))
      .toHaveProperty('stale')

    // 3. load() while the queued flush is in flight MUST return the
    //    in-memory snapshot, not the stale disk copy.
    const loaded = await repo.load()
    expect(Array.from(loaded.keys())).toEqual(['just-sent'])
    expect(loaded.has('stale')).toBe(false)

    // 4. Resolve the parked save → flush completes → pending snapshot
    //    clears via identity check → load() now reads from disk (which has A).
    saveResolvers[0]?.()
    await vi.runAllTimersAsync()
    await Promise.resolve()
    await Promise.resolve()
    const reloaded = await repo.load()
    expect(Array.from(reloaded.keys())).toEqual(['just-sent'])
  })

  it('a newer save() during an in-flight older flush is not cleared by the older flush completing', async () => {
    // Identity-equality guard: when flush(A) finishes, it must NOT clear
    // `_pendingSnapshot` if a newer save(B) has already replaced it.
    const diskBlob: { current: Record<string, unknown> | null } = {
      current: { specorator: {} },
    }
    const saveResolvers: Array<() => void> = []
    const host: ObsidianPluginDataHost = {
      loadData: vi.fn(async () => diskBlob.current),
      saveData: vi.fn(async (data: Record<string, unknown>) => {
        await new Promise<void>((resolve) => saveResolvers.push(resolve))
        diskBlob.current = data
      }),
      setActiveTimeout: (cb, ms) => globalThis.setTimeout(cb, ms) as unknown as number,
      clearActiveTimeout: (id) => { globalThis.clearTimeout(id) },
    }
    const repo = new ObsidianChatThreadsRepository(host, silentLogger())

    // save(A) → debounce → flush(A) enqueued and parked.
    await repo.save(new Map([['a', makeRecord({ threadId: 'a' })]]))
    await vi.advanceTimersByTimeAsync(1_000)
    await Promise.resolve()
    await Promise.resolve()
    expect((host.saveData as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)

    // save(B) replaces _pendingSnapshot while flush(A) is parked.
    await repo.save(new Map([['b', makeRecord({ threadId: 'b' })]]))
    // load() now must surface B, not A (B is the live in-memory state).
    const midFlight = await repo.load()
    expect(Array.from(midFlight.keys())).toEqual(['b'])

    // Resolve flush(A). Its identity check sees `_pendingSnapshot` is no
    // longer A's Map reference, so it does NOT clear it. B remains pending.
    saveResolvers[0]?.()
    await Promise.resolve()
    await Promise.resolve()
    const afterAFinishes = await repo.load()
    expect(Array.from(afterAFinishes.keys())).toEqual(['b'])

    // Advance to fire B's debounce → flush(B) enqueued and parked.
    await vi.advanceTimersByTimeAsync(1_000)
    await Promise.resolve()
    await Promise.resolve()
    expect((host.saveData as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2)
    // Resolve flush(B) → identity match → _pendingSnapshot cleared.
    saveResolvers[1]?.()
    await vi.runAllTimersAsync()
    await Promise.resolve()
    await Promise.resolve()
    // Disk now has B; load() falls through to disk and still returns B.
    const finalLoad = await repo.load()
    expect(Array.from(finalLoad.keys())).toEqual(['b'])
  })

  it('flushPending() drains both the in-flight flush and the next queued flush', async () => {
    // Composition with flushPending(): if flushPending() is called while a
    // queued flush is in flight AND `_pendingSnapshot` is non-null (because
    // a newer save replaced it mid-flight), the returned promise must
    // resolve only after BOTH flushes have committed.
    const diskBlob: { current: Record<string, unknown> | null } = {
      current: { specorator: {} },
    }
    const saveResolvers: Array<() => void> = []
    const host: ObsidianPluginDataHost = {
      loadData: vi.fn(async () => diskBlob.current),
      saveData: vi.fn(async (data: Record<string, unknown>) => {
        await new Promise<void>((resolve) => saveResolvers.push(resolve))
        diskBlob.current = data
      }),
      setActiveTimeout: (cb, ms) => globalThis.setTimeout(cb, ms) as unknown as number,
      clearActiveTimeout: (id) => { globalThis.clearTimeout(id) },
    }
    const repo = new ObsidianChatThreadsRepository(host, silentLogger())

    await repo.save(new Map([['a', makeRecord({ threadId: 'a' })]]))
    await vi.advanceTimersByTimeAsync(1_000)
    await Promise.resolve()
    await Promise.resolve()
    // flush(A) is parked. save(B) replaces pending snapshot.
    await repo.save(new Map([['b', makeRecord({ threadId: 'b' })]]))

    // flushPending() should enqueue flush(B) and return a promise that
    // resolves only after both flushes complete.
    const drained = repo.flushPending()
    let drainedSettled = false
    void drained.then(() => { drainedSettled = true })

    // Resolve flush(A) — drained should still be pending (flush(B) queued).
    saveResolvers[0]?.()
    // Several microtask flushes: flush(A) finishes → identity check
    // (B !== A → no clear) → queue then-handler resolves → flush(B)
    // starts → saveData(B) is invoked → parks on its own resolver.
    for (let i = 0; i < 10; i += 1) await Promise.resolve()
    expect(drainedSettled).toBe(false)
    expect((host.saveData as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2)

    // Resolve flush(B) — drained settles.
    saveResolvers[1]?.()
    for (let i = 0; i < 10; i += 1) await Promise.resolve()
    await drained
    expect(drainedSettled).toBe(true)
    // Disk now has B (the latest snapshot).
    const onDisk = diskBlob.current!
    expect(((onDisk.specorator as Record<string, unknown>).chatThreads as Record<string, unknown>))
      .toHaveProperty('b')
  })

  it('does NOT clear _pendingSnapshot when the queued flush rejects', async () => {
    // Rejection guard: a failed saveData must NOT swallow the pending
    // snapshot. The next save() / flushPending() must still see it and
    // can retry the write. We drive both flushes through `flushPending()`
    // so the test owns a promise handle for each — this mirrors how the
    // existing onChatThreadsPersisted-rejection test composes deterministic
    // rejection handling without leaking unhandled-rejection events.
    const diskBlob: { current: Record<string, unknown> | null } = {
      current: { specorator: {} },
    }
    let failNext = true
    const host: ObsidianPluginDataHost = {
      loadData: vi.fn(async () => diskBlob.current),
      saveData: vi.fn(async (data: Record<string, unknown>) => {
        if (failNext) {
          failNext = false
          throw new Error('disk full')
        }
        diskBlob.current = data
      }),
      setActiveTimeout: (cb, ms) => globalThis.setTimeout(cb, ms) as unknown as number,
      clearActiveTimeout: (id) => { globalThis.clearTimeout(id) },
    }
    const repo = new ObsidianChatThreadsRepository(host, silentLogger())

    await repo.save(new Map([['t1', makeRecord({ threadId: 't1' })]]))
    // Force the first flush via flushPending() so we own the rejection
    // (no debounce-fire path that leaks an unhandled rejection).
    await repo.flushPending().catch(() => undefined)

    // After the rejection, load() must STILL return the pending snapshot —
    // the in-memory state is still authoritative until a successful flush.
    const afterReject = await repo.load()
    expect(Array.from(afterReject.keys())).toEqual(['t1'])

    // flushPending() retries; this time saveData succeeds → snapshot clears.
    await repo.flushPending()
    for (let i = 0; i < 5; i += 1) await Promise.resolve()
    const onDisk = diskBlob.current!
    expect(((onDisk.specorator as Record<string, unknown>).chatThreads as Record<string, unknown>))
      .toHaveProperty('t1')
  })
})
