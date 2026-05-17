/**
 * Codex P2 round-2 (PR #406) — Plugin teardown drain for the session-log
 * mirror's debounced `updated:` frontmatter flush.
 *
 * `useSessionLogMirror` registers an `onBeforeUnmount` hook that calls
 * `flushAll()` when its sole consumer (`ChatSidebar`) unmounts — that catches
 * the sidebar-close path. The plugin's `onunload()` also has to drive a
 * drain, because Obsidian's plugin-disable / app-exit path runs through
 * `onunload()` synchronously and Vue's component unmount cannot await
 * inside its synchronous teardown phase. Without a plugin-level drain, the
 * just-appended turn body lands on disk via `appendFile` but the latest
 * `updated:` frontmatter snapshot is held only in memory and dropped.
 *
 * The plugin consumes the contract via `flushAllActiveSessionLogMirrors()`
 * exported from `@/ui/composables/useSessionLogMirror`. These tests pin that
 * `onunload()` invokes the drain.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

// `SpecoratorPlugin` (and its `SpecoratorView` import) extends Obsidian's
// `Plugin` / `ItemView`. The default vitest stub does not export those, so
// install the same minimal shims used by the sibling chat-threads-flush
// suite.
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

// Replace the composable module with a spyable shim so we can assert
// `onunload()` invokes the drain without spinning up a Vue component tree.
// `vi.mock` is hoisted above the import below.
const flushSpy = vi.fn(async () => undefined)
vi.mock('@/ui/composables/useSessionLogMirror', () => ({
  // useSessionLogMirror itself is not consumed by main.ts — only the drain
  // function is. Provide a no-op so the mock is total.
  useSessionLogMirror: () => ({ getMirror: async () => null }),
  flushAllActiveSessionLogMirrors: () => flushSpy(),
}))

import SpecoratorPlugin from '@/plugin/main'

function makePlugin(initialData: Record<string, unknown> = { specorator: {} }): SpecoratorPlugin {
  // Bare prototype-rooted plugin — bypasses Obsidian's `App`-requiring
  // constructor and lets us drive `onunload()` directly. Mirrors the
  // pattern in `tests/plugin/main.chat-threads-flush.test.ts`.
  const plugin = Object.create(SpecoratorPlugin.prototype) as Record<string, unknown>
  plugin._storedData = { ...initialData }
  plugin._initialChatThreads = []
  plugin._chatThreadsFlushTimer = null
  plugin._pendingChatThreadsSnapshot = null
  plugin._chatThreadsFlushQueue = Promise.resolve()
  plugin.loadData = vi.fn(async () => initialData)
  plugin.saveData = vi.fn(async (_data: unknown) => undefined)
  plugin.app = { workspace: { detachLeavesOfType: vi.fn() } }
  plugin.bridge = { hideAllNotices: vi.fn() }
  plugin.core = null
  return plugin as unknown as SpecoratorPlugin
}

describe('SpecoratorPlugin.onunload() — session-log mirror drain (Codex P2 round-2, PR #406)', () => {
  beforeEach(() => {
    flushSpy.mockClear()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls flushAllActiveSessionLogMirrors() exactly once on unload', () => {
    // Repro: pending debounced `updated:` flush in the writer's per-path
    // PendingFlush map needs a drain. onunload() must invoke the drain
    // function the composable layer exports. Counting calls is the
    // load-bearing assertion — the drain's internal correctness is covered
    // by the SessionLogWriter.flushAll round-3 tests.
    const plugin = makePlugin()

    plugin.onunload()

    expect(flushSpy).toHaveBeenCalledTimes(1)
  })

  it('invokes the drain even when no chatThreads flush is pending', () => {
    // The two teardown surfaces (chatThreads vs session-log mirror) are
    // independent. A user who reads but never sends a message would hit
    // the no-pending-chatThreads branch; the session-log drain must still
    // fire in case a mirror was constructed for the initial render.
    const plugin = makePlugin()
    // Ensure no chat-threads snapshot is pending — exercises the early
    // return on the chatThreads side of onunload().
    ;(plugin as unknown as { _pendingChatThreadsSnapshot: unknown })._pendingChatThreadsSnapshot = null

    plugin.onunload()

    expect(flushSpy).toHaveBeenCalledTimes(1)
  })

  it('drains the session-log mirror before forwarding to bridge.hideAllNotices', () => {
    // Order matters for the cleanup-then-cosmetic flow: we want any final
    // `updated:` write to land before notice-clearing logic that touches
    // unrelated UI state. Capture call ordering via side-effect counters.
    const plugin = makePlugin()
    const callOrder: string[] = []
    flushSpy.mockImplementation(async () => {
      callOrder.push('flushAllActiveSessionLogMirrors')
    })
    ;(plugin as unknown as { bridge: { hideAllNotices: () => void } }).bridge = {
      hideAllNotices: () => callOrder.push('hideAllNotices'),
    }

    plugin.onunload()

    // Both fired; flush is invoked first (sync `void` call) so it appears
    // in the order array before the synchronous hideAllNotices call.
    expect(callOrder[0]).toBe('flushAllActiveSessionLogMirrors')
    expect(callOrder).toContain('hideAllNotices')
  })
})
