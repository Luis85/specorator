/**
 * T-ASM-053 / T-ASM-054 — Persistence-flush tests for the chatThreads blob.
 *
 * These tests exercise the debounced save path on the plugin directly, using
 * fake timers and a minimal plugin shim so we can assert the on-disk blob
 * shape without booting the Obsidian runtime.
 *
 * Covers:
 *   - Persisted writes land under `_storedData.specorator.chatThreads` (SPEC §9.3).
 *   - The flush is debounced — rapid mutations coalesce into one `saveData` call.
 *   - The flush filters out degraded-transport threads (SPEC §2.2, ADR-0031).
 *   - The flush preserves sibling `specorator.*` keys (settings coexistence).
 *
 * The plugin shim is constructed by extending the real `SpecoratorPlugin`
 * class with stubs for `loadData` / `saveData` and an `activeWindow` shim;
 * we avoid the full Obsidian boot path that requires a real `App`.
 *
 * Satisfies REQ-ASM-037.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

// `SpecoratorPlugin` (and its `SpecoratorView` import) extends Obsidian's
// `Plugin` / `ItemView`. The default vitest stub does not export those, so
// we install minimal shims for this file only.
vi.mock('obsidian', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('obsidian')
  return {
    ...actual,
    Platform: { isMobile: false },
    Plugin: class {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      constructor(public app: any, public manifest: any) {}
      register(_cb: () => void): void { /* no-op */ }
      addRibbonIcon(): unknown { return null }
      addCommand(): unknown { return null }
      addSettingTab(): unknown { return null }
      registerView(): unknown { return null }
      registerEvent(): unknown { return null }
      registerObsidianProtocolHandler(): unknown { return null }
      async loadData(): Promise<unknown> { return null }
      async saveData(_data: unknown): Promise<void> { /* no-op */ }
    },
    ItemView: class {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      constructor(public leaf: any) {}
    },
    PluginSettingTab: class {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      constructor(public app: any, public plugin: any) {}
    },
    Setting: class {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      constructor(public containerEl: any) {}
      setName(): this { return this }
      setDesc(): this { return this }
      setHeading(): this { return this }
      addText(): this { return this }
      addToggle(): this { return this }
      addDropdown(): this { return this }
      addButton(): this { return this }
      addExtraButton(): this { return this }
    },
    Modal: class {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      constructor(public app: any) {}
      open(): void { /* no-op */ }
      close(): void { /* no-op */ }
    },
  }
})

import { asSessionId } from '@/domain/chat/SessionId'
import type { ChatThreadRecord } from '@/domain/chat/ChatThreadRecord'
import SpecoratorPlugin from '@/plugin/main'

interface SavedState {
  blob: Record<string, unknown> | null
  saveCount: number
}

function makePlugin(initialData: Record<string, unknown>): {
  plugin: SpecoratorPlugin
  state: SavedState
} {
  const state: SavedState = { blob: null, saveCount: 0 }

  // Build a minimal stand-in. We don't instantiate via `new SpecoratorPlugin(app, manifest)`
  // because the Obsidian `Plugin` constructor expects a fully-wired App. Instead we
  // construct a bare object whose prototype is `SpecoratorPlugin.prototype` and
  // install the two private fields the persistence path touches.
  const plugin = Object.create(SpecoratorPlugin.prototype) as Record<string, unknown>
  plugin._storedData = { ...initialData }
  plugin._initialChatThreads = []
  plugin._chatThreadsFlushTimer = null
  plugin.loadData = vi.fn(async () => initialData)
  plugin.saveData = vi.fn(async (data: Record<string, unknown>) => {
    state.blob = data
    state.saveCount += 1
  })
  return { plugin: plugin as unknown as SpecoratorPlugin, state }
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

// Obsidian exposes `activeWindow` as a global pointing at the active popout
// window. Under vitest the global is absent, so install a shim that routes
// through the test environment's `setTimeout` / `clearTimeout`. Using a typed
// helper keeps the obsidianmd `prefer-active-doc` rule satisfied for the
// surrounding source while still allowing the shim itself to exist.
/* eslint-disable obsidianmd/prefer-active-doc */
interface ActiveWindowShim {
  setTimeout: (cb: () => void, ms: number) => number
  clearTimeout: (id: number) => void
}
function installActiveWindowShim(): ActiveWindowShim | undefined {
  const target = globalThis as unknown as { activeWindow?: ActiveWindowShim }
  const prior = target.activeWindow
  target.activeWindow = {
    setTimeout: (cb, ms) => globalThis.setTimeout(cb, ms) as unknown as number,
    clearTimeout: (id) => { globalThis.clearTimeout(id) },
  }
  return prior
}
function restoreActiveWindow(prior: ActiveWindowShim | undefined): void {
  const target = globalThis as unknown as { activeWindow?: ActiveWindowShim }
  if (prior === undefined) delete target.activeWindow
  else target.activeWindow = prior
}
/* eslint-enable obsidianmd/prefer-active-doc */

describe('scheduleChatThreadsPersistence — debounced flush (T-ASM-054)', () => {
  let activeWindowRestore: ActiveWindowShim | undefined
  beforeEach(() => {
    vi.useFakeTimers()
    activeWindowRestore = installActiveWindowShim()
  })
  afterEach(() => {
    vi.useRealTimers()
    restoreActiveWindow(activeWindowRestore)
  })

  it('writes a single blob after the 1 s debounce window expires', async () => {
    const { plugin, state } = makePlugin({
      specorator: { locale: 'en', specsFolder: 'specs', anthropicApiKey: '' },
    })
    const map = new Map<string, ChatThreadRecord>([['t1', makeRecord({ threadId: 't1' })]])

    plugin.scheduleChatThreadsPersistence(map)
    expect(state.saveCount).toBe(0) // not flushed yet — still inside debounce

    await vi.advanceTimersByTimeAsync(1_000)

    expect(state.saveCount).toBe(1)
    const specorator = state.blob?.specorator as Record<string, unknown>
    expect(specorator.chatThreads).toEqual({
      t1: {
        threadId: 't1', sessionId: 'sess-1', feature: 'foo',
        logPath: 'specs/foo/sessions/sess-1.md', transport: 'subscription',
        createdAt: '2026-05-14T10:00:00.000Z', lastUsedAt: '2026-05-14T10:00:00.000Z',
      },
    })
  })

  it('coalesces rapid mutations into one flush (prevents disk thrashing)', async () => {
    const { plugin, state } = makePlugin({
      specorator: { locale: 'en', specsFolder: 'specs' },
    })
    plugin.scheduleChatThreadsPersistence(new Map([['t1', makeRecord({ threadId: 't1' })]]))
    plugin.scheduleChatThreadsPersistence(new Map([['t1', makeRecord({ threadId: 't1' })]]))
    plugin.scheduleChatThreadsPersistence(new Map([
      ['t1', makeRecord({ threadId: 't1' })],
      ['t2', makeRecord({ threadId: 't2', sessionId: asSessionId('s2'), transport: 'api-key' })],
    ]))

    await vi.advanceTimersByTimeAsync(1_000)

    expect(state.saveCount).toBe(1)
    const specorator = state.blob?.specorator as Record<string, unknown>
    const chatThreads = specorator.chatThreads as Record<string, unknown>
    expect(Object.keys(chatThreads).sort()).toEqual(['t1', 't2'])
  })

  it('preserves sibling specorator keys (PluginSettings coexistence, SPEC §9.3)', async () => {
    const { plugin, state } = makePlugin({
      specorator: {
        locale: 'en',
        specsFolder: 'specs',
        anthropicApiKey: 'sk-test',
        claudeCliPath: '/usr/local/bin/claude',
        transportKind: 'auto',
      },
      _moduleVersions: { hello: 1 },
      hello: { showBadge: true },
    })
    plugin.scheduleChatThreadsPersistence(new Map([['t1', makeRecord({ threadId: 't1' })]]))
    await vi.advanceTimersByTimeAsync(1_000)

    const specorator = state.blob?.specorator as Record<string, unknown>
    expect(specorator.locale).toBe('en')
    expect(specorator.specsFolder).toBe('specs')
    expect(specorator.anthropicApiKey).toBe('sk-test')
    expect(specorator.claudeCliPath).toBe('/usr/local/bin/claude')
    expect(specorator.transportKind).toBe('auto')
    // Sibling top-level keys outside `specorator` survive too.
    expect(state.blob?._moduleVersions).toEqual({ hello: 1 })
    expect(state.blob?.hello).toEqual({ showBadge: true })
  })

  it('filters degraded-transport records at flush time (NOT persisted)', async () => {
    const { plugin, state } = makePlugin({ specorator: {} })
    const persisted = makeRecord({ threadId: 'keep', transport: 'subscription' })
    // Simulate an in-memory degraded thread that the store currently holds.
    const degraded = {
      ...makeRecord({ threadId: 'drop' }),
      transport: 'degraded',
    } as unknown as ChatThreadRecord

    plugin.scheduleChatThreadsPersistence(
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
})

describe('getInitialChatThreads — read path (T-ASM-053)', () => {
  it('returns the records hydrated by loadSettings()', async () => {
    const blob = {
      specorator: {
        locale: 'en',
        chatThreads: {
          't1': {
            threadId: 't1', sessionId: 's1', feature: 'foo',
            logPath: 'specs/foo/sessions/s1.md', transport: 'subscription',
            createdAt: '2026-05-14T08:00:00.000Z', lastUsedAt: '2026-05-14T09:00:00.000Z',
          },
        },
      },
    }
    const { plugin } = makePlugin(blob)
    await plugin.loadSettings()

    const records = plugin.getInitialChatThreads()
    expect(records).toHaveLength(1)
    expect(records[0].threadId).toBe('t1')
    expect(records[0].sessionId).toBe('s1')
  })

  it('returns [] when no chatThreads key is present (first load)', async () => {
    const { plugin } = makePlugin({ specorator: { locale: 'en' } })
    await plugin.loadSettings()

    expect(plugin.getInitialChatThreads()).toEqual([])
  })
})
