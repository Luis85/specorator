import { Plugin, TFolder } from 'obsidian'
// SPEC-ASM-001 §9.1 — `child_process.spawn` is imported statically at the top
// of this file so the subscription adapter's constructor in `onload()` has no
// dynamic-import sites. The ESLint guard for unbundled `child_process` is
// satisfied because this is the plugin entry, which always runs in Electron.
import { spawn } from 'node:child_process'
import * as os from 'node:os'
import { SpecoratorView, VIEW_TYPE } from './SpecoratorView'
import { SpecoratorSettingTab } from './settings'
import { promoteLegacyFlatSettings } from './loadSettings-migrate'
import { ensureLeafLoaded } from './leafLoader'
import { selectTransport } from './transport/TransportSelector'
import { DEFAULT_SETTINGS, type PluginSettings } from '@/domain/settings/PluginSettings'
import type { ChatThreadRecord } from '@/domain/chat/ChatThreadRecord'
import {
  decodeChatThreadsBlob,
  encodeChatThreadsBlob,
} from './chatThreadsPersistence'
import { ObsidianBridge } from '@/infrastructure/obsidian/ObsidianBridge'
import { ObsidianMcpServerAdapter } from '@/infrastructure/obsidian/ObsidianMcpServerAdapter'
import { ObsidianMetadataCacheAdapter } from '@/infrastructure/obsidian/ObsidianMetadataCacheAdapter'
import { ObsidianCanvasAdapter } from '@/infrastructure/obsidian/ObsidianCanvasAdapter'
import { ClaudeCliAdapter } from '@/infrastructure/obsidian/ClaudeCliAdapter'
import { ClaudeSubprocessAdapter, type SpawnFn } from '@/infrastructure/obsidian/ClaudeSubprocessAdapter'
import { ClaudeBinaryResolver, type SpawnFn as ResolverSpawnFn } from '@/infrastructure/obsidian/ClaudeBinaryResolver'
import { degradedClaudeCliPort } from '@/infrastructure/bridge/degradedClaudeCliPort'
import { FeatureRepository } from '@/infrastructure/bridge/FeatureRepository'
import { FeedbackService } from '@/application/shared/FeedbackService'
import { PluginCore } from '@/core/plugin-core'
import { ALL_MODULES, type ModuleDescriptor } from '@/modules'
import { i18nMerge, i18nTranslate, setLocale, type SupportedLocale } from '@/ui/i18n'
import type { TranslationPort } from '@/domain/ports'
import { useChatStore } from '@/ui/stores/chatStore'

export default class SpecoratorPlugin extends Plugin {
  settings: PluginSettings = { ...DEFAULT_SETTINGS }
  core: PluginCore | null = null
  bridge: ObsidianBridge | null = null

  /** Full stored data blob: specorator sub-key + per-module sub-keys + _moduleVersions. */
  private _storedData: Record<string, unknown> = {}
  /** ClaudeCliAdapter instance — created in onload(), destroyed in onunload(). */
  private _claudeCliAdapter: ClaudeCliAdapter | null = null
  /**
   * Subscription-transport adapter — created in onload(), shut down in
   * onunload() via `this.register(() => adapter.shutdown())`.
   * Satisfies SPEC-ASM-001 §9.1.
   */
  private _subscriptionAdapter: ClaudeSubprocessAdapter | null = null
  /** SpecoratorView instance — set when the registered view factory runs. */
  private _specoratorView: SpecoratorView | null = null

  /**
   * Initial `chatThreads` records hydrated from plugin data at `loadSettings()`
   * (SPEC-ASM-001 §9.3, ADR-0031). Read by `SpecoratorView.onOpen()` to seed
   * the Pinia chat store and reset on each successful read. Malformed records
   * are filtered out at decode time and logged at `warn` (SPEC §11.3).
   */
  private _initialChatThreads: ReadonlyArray<ChatThreadRecord> = []
  /** Debounced persistence timer for `chatThreads`. SPEC §9.3 / OQ-ASM-T1. */
  private _chatThreadsFlushTimer: number | null = null
  /** Default debounce window in milliseconds for chatThreads flushes. */
  private static readonly _CHAT_THREADS_FLUSH_DEBOUNCE_MS = 1_000

  async onload(): Promise<void> {
    await this.loadSettings()

    this.bridge = new ObsidianBridge(
      this.app,
      () => this.settings,
      (s) => this.updateSettings(s),
    )
    const translationPort: TranslationPort = { t: i18nTranslate }
    this.core = new PluginCore(ALL_MODULES as ReadonlyArray<ModuleDescriptor>, {
      settings: this.bridge,
      vault: this.bridge,
      workspace: this.bridge,
      notifications: this.bridge,
      logger: this.bridge,
      t: translationPort,
      i18nMerge,
      // REQ-AVS-005: inject FeedbackService into the MCP adapter so
      // overwrite-protection notices fire consistently on both the UI and MCP
      // code paths. Without this, MCP-driven `workflow_create_artifact` and
      // `workflow_propose_advance` accepts silently preserve existing files.
      mcpServer: new ObsidianMcpServerAdapter(
        this.bridge,
        new FeatureRepository(this.bridge, this.bridge),
        () => this.settings.specsFolder,
        new ObsidianMetadataCacheAdapter(this.app),
        new ObsidianCanvasAdapter(this.bridge),
        new FeedbackService(this.bridge, this.bridge),
      ),
      isMcpServerEnabled: () => this.settings.mcpServerEnabled,
    })

    setLocale(this.settings.locale as SupportedLocale)
    // Pass the full stored blob so PluginCore can migrate per-module settings in-place.
    await this.core.init(this._storedData)

    // Re-sync PluginSettings from the specorator blob after migration/validation may have coerced values.
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...((this._storedData.specorator ?? {}) as Partial<PluginSettings>),
    }

    // Persist any migrations that occurred during init.
    await this.saveData(this._storedData)

    // T-CCS-032: Instantiate ClaudeCliAdapter. startup() is deferred to onLayoutReady
    // so it does not hold up the critical onload() path.
    this._claudeCliAdapter = new ClaudeCliAdapter(
      () => this.settings,
      this.bridge,
    )
    this.register(() => { this._claudeCliAdapter?.shutdown() })

    // T-ASM-020 / SPEC-ASM-001 §9.1 — subscription-transport adapter. The
    // `resolveCliPath` closure constructs a fresh `ClaudeBinaryResolver` per
    // call so PATH changes between Settings-tab "Autodetect" clicks are
    // honoured (T-ASM-009 design note). The static `spawn` import above keeps
    // this constructor call free of dynamic-import sites.
    const resolverPlatform: 'darwin' | 'linux' | 'win32' =
      os.platform() === 'win32' ? 'win32' : os.platform() === 'darwin' ? 'darwin' : 'linux'
    // Wrap the imported `spawn` in a typed lambda so TS picks the
    // `(command, args, options?) => ChildProcess` overload that matches the
    // adapter's `SpawnFn` signature (the bare `spawn` import resolves to a
    // multi-overload union TS narrows incorrectly here).
    const spawnFn: SpawnFn = (command, args, options) =>
      options === undefined
        ? spawn(command, args as string[])
        : spawn(command, args as string[], options)
    const resolverSpawnFn: ResolverSpawnFn = (command, args, options) =>
      options === undefined
        ? spawn(command, args as string[])
        : spawn(command, args as string[], options)
    this._subscriptionAdapter = new ClaudeSubprocessAdapter({
      getSettings: () => this.settings,
      logger: this.bridge,
      resolveCliPath: () => new ClaudeBinaryResolver({
        spawn: resolverSpawnFn,
        platform: resolverPlatform,
      }).resolve(),
      spawn: spawnFn,
      now: () => Date.now(),
    })
    this.register(() => { this._subscriptionAdapter?.shutdown() })

    this.registerView(VIEW_TYPE, (leaf) => {
      const view = new SpecoratorView(leaf, this, this._claudeCliAdapter!, {
        subscriptionAdapter: this._subscriptionAdapter!,
        selectTransport: (settings) =>
          selectTransport(settings, {
            sdkAdapter: this._claudeCliAdapter!,
            subscriptionAdapter: this._subscriptionAdapter!,
            degradedPort: degradedClaudeCliPort,
            // Synchronous projection — see SPEC-ASM-001 §3.1 closing note and
            // ClaudeSubprocessAdapter.isAvailableSync(). Evaluated at every
            // selector call so post-startup() availability is honoured.
            cliResolved: this._subscriptionAdapter!.isAvailableSync(),
          }),
      })
      this._specoratorView = view
      return view
    })

    this.addRibbonIcon('layout-dashboard', 'Open Specorator', () => {
      void this.activateView()
    })

    this.addCommand({
      // Keep the original command id so existing hotkeys and automations survive upgrades.
      // eslint-disable-next-line obsidianmd/commands/no-plugin-id-in-command-id
      id: 'open-specorator',
      name: 'Open panel',
      callback: () => void this.activateView(),
    })

    this.addCommand({
      id: 'start-mcp-server',
      name: 'Start MCP server',
      callback: () => void this.updateSettings({ mcpServerEnabled: true }),
    })

    this.addCommand({
      id: 'stop-mcp-server',
      name: 'Stop MCP server',
      callback: () => void this.updateSettings({ mcpServerEnabled: false }),
    })

    this.addCommand({
      id: 're-run-setup',
      name: 'Re-run setup',
      callback: () => {
        void this.updateSettings({ onboardingComplete: false })
          .then(() => this.activateView())
          .then(() => { this._dispatchNavigate('/onboarding') })
          .catch(() => { this.bridge?.showError('Failed to re-run setup. Please try again.') })
      },
    })

    this.addSettingTab(new SpecoratorSettingTab(this.app, this))

    // T-CCS-031: Right-click "Add to chat context" menu item on vault files.
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        menu.addItem((item) => {
          item
            .setTitle('Add to chat context')
            .setIcon('message-square-plus')
            .onClick(() => {
              void this.activateView().then(() => {
                if (this._specoratorView?.pinia) {
                  const store = useChatStore(this._specoratorView.pinia)
                  store.addContextFile({ path: file.path, label: file.name, isAuto: false })
                }
              })
            })
        })
      }),
    )

    // T-CCS-034: Track the active file and update the store's auto context slot.
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => {
        const activeFile = this.app.workspace.getActiveFile()
        if (this._specoratorView?.pinia) {
          const store = useChatStore(this._specoratorView.pinia)
          if (activeFile) {
            store.setActiveFile({ path: activeFile.path, label: activeFile.name, isAuto: true })
          } else {
            store.setActiveFile(null)
          }
        }
      }),
    )

    this.registerObsidianProtocolHandler('specorator', (params) => {
      const searchParams = new URLSearchParams(Object.entries(params))
      if (this.core?.handleUri(searchParams) === true) return

      // T-CCS-033: Navigate to /chat when action=open-chat.
      const action = params.action
      if (action === 'open-chat' || action === 'focus-chat') {
        void this.activateView().then(() => {
          this._specoratorView?.navigateTo('/chat')
        })
        return
      }
      if (action === 'send-message' || action === 'open-workflow') {
        this.bridge?.showInfo(`URI action "${action}" is not yet implemented.`)
        return
      }
      this.bridge?.showWarning(`Unknown Specorator URI action: "${action}"`)
    })

    // Workspace/vault index isn't guaranteed ready during onload(). Defer any
    // logic that reads workspace layout or vault state until layout is ready.
    this.app.workspace.onLayoutReady(() => {
      // T-CCS-032 / T-ASM-020 / SPEC-ASM-001 §9.2 — pre-warm both adapters in
      // parallel so startup() does not block onload(). Each adapter handles
      // its own failures internally (REQ-ASM-009, NFR-ASM-006).
      void Promise.all([
        this._claudeCliAdapter?.startup(),
        this._subscriptionAdapter?.startup(),
      ])
      this.detectLegacyVaultLayout()
      if (!this.settings.onboardingComplete) {
        void this.activateView()
          .then(() => { this._dispatchNavigate('/onboarding') })
          .catch(() => { this.bridge?.showError('Failed to open onboarding. Please reopen the panel.') })
      }
    })
  }

  // Obsidian's lifecycle guarantees a single onunload() call when the plugin
  // is disabled or the app exits, so detaching our own leaves here is the
  // expected cleanup path despite the obsidianmd/detach-leaves rule's caution.
  // eslint-disable-next-line obsidianmd/detach-leaves
  override onunload(): void {
    if (this._chatThreadsFlushTimer !== null) {
      activeWindow.clearTimeout(this._chatThreadsFlushTimer)
      this._chatThreadsFlushTimer = null
    }
    this.app.workspace.detachLeavesOfType(VIEW_TYPE)
    this.bridge?.hideAllNotices()
    // onunload() is synchronous (Obsidian contract). destroy() is fire-and-forget;
    // module destroy() implementations must be fast and non-critical.
    void this.core?.destroy()
  }

  async loadSettings(): Promise<void> {
    const stored = (await this.loadData()) as Record<string, unknown> | null
    const raw: Record<string, unknown> = { ...(stored ?? {}) }

    this._storedData = promoteLegacyFlatSettings(raw)

    this.settings = {
      ...DEFAULT_SETTINGS,
      ...((this._storedData.specorator ?? {}) as Partial<PluginSettings>),
    }

    // SPEC-ASM-001 §9.3 — read the `chatThreads` blob alongside settings so
    // `SpecoratorView.onOpen()` can hydrate the chat store after the view
    // mounts. Decoding uses the plugin bridge logger when present (typed once
    // available in `onload()`); during `loadSettings()` we route warnings to
    // `console.warn` because `this.bridge` is not yet constructed.
    const specoratorBlob = (this._storedData.specorator ?? {}) as Record<string, unknown>
    const chatThreadsBlob = specoratorBlob.chatThreads
    this._initialChatThreads = decodeChatThreadsBlob(chatThreadsBlob, {
      debug: () => undefined,
      info: () => undefined,
      warn: (msg, ctx) => { console.warn(msg, ctx ?? {}) },
      error: (msg, ctx) => { console.error(msg, ctx ?? {}) },
    })
  }

  /**
   * Records hydrated from `_storedData.specorator.chatThreads` during
   * `loadSettings()`. Consumed by `SpecoratorView.onOpen()` (SPEC §9.5 /
   * REQ-ASM-037) to seed the Pinia chat store.
   */
  getInitialChatThreads(): ReadonlyArray<ChatThreadRecord> {
    return this._initialChatThreads
  }

  /**
   * Persists the in-memory `chatThreads` map to plugin data under
   * `_storedData.specorator.chatThreads` (SPEC §9.3). Filters out
   * `degraded`-transport records at encode time. Coalesces rapid mutations
   * via a 1 s debounce (OQ-ASM-T1) to prevent disk thrashing during streaming
   * turns.
   *
   * Satisfies REQ-ASM-037 / T-ASM-054.
   */
  scheduleChatThreadsPersistence(records: ReadonlyMap<string, ChatThreadRecord>): void {
    const snapshot = new Map(records)
    if (this._chatThreadsFlushTimer !== null) {
      activeWindow.clearTimeout(this._chatThreadsFlushTimer)
    }
    this._chatThreadsFlushTimer = activeWindow.setTimeout(() => {
      this._chatThreadsFlushTimer = null
      void this._flushChatThreads(snapshot)
    }, SpecoratorPlugin._CHAT_THREADS_FLUSH_DEBOUNCE_MS)
  }

  /**
   * Internal: write the encoded `chatThreads` blob into `_storedData` while
   * preserving every other sibling key under `specorator` (PluginSettings,
   * unrelated module data, etc.) — see SPEC §9.3 coexistence guarantee.
   */
  private async _flushChatThreads(
    records: ReadonlyMap<string, ChatThreadRecord>,
  ): Promise<void> {
    const encoded = encodeChatThreadsBlob(records)
    const currentSpecorator = (this._storedData.specorator ?? {}) as Record<string, unknown>
    const nextSpecorator = { ...currentSpecorator, chatThreads: encoded }
    this._storedData = { ...this._storedData, specorator: nextSpecorator }
    await this.saveData(this._storedData)
  }

  async updateSettings(partial: Partial<PluginSettings>): Promise<void> {
    const merged = { ...this.settings, ...partial }
    this.settings = merged
    await this.core?.notifySettingsChanged('specorator', merged)
    const validated = (this.core?.getModuleSettings('specorator') ?? merged) as PluginSettings
    this.settings = validated
    this._storedData = { ...this._storedData, specorator: { ...validated } }
    await this.saveData(this._storedData)
  }

  async updateModuleSettings(settingsKey: string, partial: Record<string, unknown>): Promise<void> {
    const current = (this._storedData[settingsKey] ?? {}) as Record<string, unknown>
    const merged = { ...current, ...partial }
    // Notify first so validateSettings runs; persist the (possibly coerced) validated value.
    await this.core?.notifySettingsChanged(settingsKey, merged)
    const validated = (this.core?.getModuleSettings(settingsKey) ?? merged) as Record<string, unknown>
    this._storedData = { ...this._storedData, [settingsKey]: validated }
    await this.saveData(this._storedData)
  }

  /**
   * DESIGN-AVS-001: If the vault has a `features/` folder but not a `specs/`
   * folder, show a one-time notice informing the user to rename it.
   */
  private detectLegacyVaultLayout(): void {
    if (!this.bridge) return
    const hasFeaturesFolder = this.app.vault.getAbstractFileByPath('features') instanceof TFolder
    const hasSpecsFolder = this.app.vault.getAbstractFileByPath(this.settings.specsFolder) instanceof TFolder
    if (hasFeaturesFolder && !hasSpecsFolder) {
      this.bridge.showWarning(
        `This vault uses the old \`features/\` folder. ` +
          `Please rename it to \`${this.settings.specsFolder}/\` or update the Specs folder setting.`,
        8000,
      )
    }
  }

  _dispatchNavigate(path: string): void {
    const win =
      this.app.workspace.getLeavesOfType(VIEW_TYPE)[0]?.view?.containerEl?.ownerDocument?.defaultView ??
      activeWindow
    win.dispatchEvent(new CustomEvent('sp:navigate', { detail: { path } }))
  }

  async activateView(): Promise<void> {
    const { workspace } = this.app

    const existing = workspace.getLeavesOfType(VIEW_TYPE)
    if (existing.length > 0) {
      await ensureLeafLoaded(existing[0])
      void workspace.revealLeaf(existing[0])
      return
    }

    const leaf = workspace.getRightLeaf(false)
    if (leaf === null) return
    await leaf.setViewState({ type: VIEW_TYPE, active: true })
    void workspace.revealLeaf(leaf)
  }
}
