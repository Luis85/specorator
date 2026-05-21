/**
 * T-MPS-026 — Integration: `migrateProviderSelection` runs on plugin load.
 *
 * Covers REQ-MPS-004, REQ-MPS-005, NFR-MPS-006. Stands up a minimal
 * `SpecoratorPlugin` shim (mirrors the model used by
 * `main.chat-threads-flush.test.ts`) and drives `loadSettings()` end-to-end
 * with three fixture `data.json` blobs. Asserts:
 *
 *   - The legacy `transportKind` is translated to `providerSelection` and
 *     the legacy key is removed from `_storedData.specorator`.
 *   - Per-record `chatThreads.transport` is translated to the discriminated
 *     `{ provider, mode }` object.
 *   - `saveData` is invoked exactly once on the first load (the migration
 *     persists the translated blob).
 *   - A second `loadSettings()` is a no-op (`saveData` not called again),
 *     proving idempotency at the integration level.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Obsidian stub — mirrors `main.chat-threads-flush.test.ts`.
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

import SpecoratorPlugin from '@/plugin/main'

import autoFixture from '../fixtures/data-json-legacy/auto.json'
import apiKeyFixture from '../fixtures/data-json-legacy/api-key.json'
import subscriptionFixture from '../fixtures/data-json-legacy/subscription.json'

interface RunState {
  blob: Record<string, unknown> | null
  saveCount: number
}

function makePlugin(initialData: Record<string, unknown>): {
  plugin: SpecoratorPlugin
  state: RunState
} {
  const state: RunState = { blob: null, saveCount: 0 }
  const plugin = Object.create(SpecoratorPlugin.prototype) as Record<string, unknown>
  plugin._storedData = {}
  plugin._initialChatThreads = []
  plugin._chatThreadsFlushTimer = null
  plugin._pendingChatThreadsSnapshot = null
  plugin._chatThreadsFlushQueue = Promise.resolve()
  let current: Record<string, unknown> = { ...initialData }
  plugin.loadData = vi.fn(async () => current)
  plugin.saveData = vi.fn(async (data: Record<string, unknown>) => {
    state.blob = data
    state.saveCount += 1
    // Subsequent loadData reads must reflect the persisted state so the
    // idempotency assertion in the test below has real teeth.
    current = data
  })
  // Mocked secret-store hook so the test does not call into ObsidianSecretStoreAdapter.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(plugin as any)._initializeSecretStore = async (): Promise<void> => { /* no-op */ }
  plugin.app = { workspace: { detachLeavesOfType: vi.fn() } }
  return { plugin: plugin as unknown as SpecoratorPlugin, state }
}

describe('plugin loadSettings — migrateProviderSelection integration (T-MPS-026)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('translates transportKind=auto to providerSelection={forced:auto} and deletes the legacy key', async () => {
    const { plugin, state } = makePlugin(structuredClone(autoFixture))
    await plugin.loadSettings()
    expect(state.saveCount).toBe(1)
    const specorator = (state.blob!).specorator as Record<string, unknown>
    expect(specorator.providerSelection).toEqual({ forced: 'auto' })
    expect('transportKind' in specorator).toBe(false)
  })

  it('translates transportKind=api-key to providerSelection={provider:claude,mode:api}', async () => {
    const { plugin, state } = makePlugin(structuredClone(apiKeyFixture))
    await plugin.loadSettings()
    expect(state.saveCount).toBe(1)
    const specorator = (state.blob!).specorator as Record<string, unknown>
    expect(specorator.providerSelection).toEqual({ provider: 'claude', mode: 'api' })
    expect('transportKind' in specorator).toBe(false)
  })

  it('translates transportKind=subscription to providerSelection={provider:claude,mode:cli}', async () => {
    const { plugin, state } = makePlugin(structuredClone(subscriptionFixture))
    await plugin.loadSettings()
    expect(state.saveCount).toBe(1)
    const specorator = (state.blob!).specorator as Record<string, unknown>
    expect(specorator.providerSelection).toEqual({ provider: 'claude', mode: 'cli' })
    expect('transportKind' in specorator).toBe(false)
  })

  it('translates chatThreads.transport=api-key to the discriminated object', async () => {
    const { plugin, state } = makePlugin(structuredClone(apiKeyFixture))
    await plugin.loadSettings()
    const specorator = (state.blob!).specorator as Record<string, unknown>
    const threads = specorator.chatThreads as Record<string, Record<string, unknown>>
    expect(threads['t-api'].transport).toEqual({ provider: 'claude', mode: 'api' })
    expect(threads['t-api'].title).toBe('')
    expect(threads['t-api'].forkParent).toBeNull()
  })

  it('translates chatThreads.transport=subscription to the discriminated object', async () => {
    const { plugin, state } = makePlugin(structuredClone(subscriptionFixture))
    await plugin.loadSettings()
    const specorator = (state.blob!).specorator as Record<string, unknown>
    const threads = specorator.chatThreads as Record<string, Record<string, unknown>>
    expect(threads['t-sub'].transport).toEqual({ provider: 'claude', mode: 'cli' })
  })

  it('running loadSettings a second time is a no-op (idempotent — saveData not re-invoked)', async () => {
    const { plugin, state } = makePlugin(structuredClone(subscriptionFixture))
    await plugin.loadSettings()
    expect(state.saveCount).toBe(1)
    await plugin.loadSettings()
    expect(state.saveCount).toBe(1)
  })

  it('a fully-migrated blob does not trigger a saveData on first load', async () => {
    const migrated = {
      specorator: {
        locale: 'en',
        specsFolder: 'specs',
        archiveFolder: 'archive',
        decisionsFolder: 'decisions',
        constitutionFile: 'CONSTITUTION.md',
        gateStrictness: 'strict',
        teamMode: false,
        logLevel: 'warn',
        mcpServerEnabled: false,
        userPersona: '',
        onboardingComplete: true,
        claudeCliPath: '',
        providerSelection: { forced: 'auto' },
        cursorCliPath: '',
        cursorApiPreview: false,
        autoPreferProvider: 'claude',
        providerModel: { claude: 'claude-sonnet-4', cursor: 'cursor-default' },
        chatTabCap: 10,
      },
      _moduleVersions: { specorator: 3 },
    }
    const { plugin, state } = makePlugin(structuredClone(migrated))
    await plugin.loadSettings()
    expect(state.saveCount).toBe(0)
  })
})
