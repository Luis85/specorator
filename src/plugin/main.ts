import { Plugin, TFile, TFolder } from 'obsidian'
// SPEC-ASM-001 §9.1 — `child_process.spawn` is imported statically at the top
// of this file so the subscription adapter's constructor in `onload()` has no
// dynamic-import sites. The ESLint guard for unbundled `child_process` is
// satisfied because this is the plugin entry, which always runs in Electron.
import { spawn } from 'node:child_process'
import * as os from 'node:os'
import { SpecoratorView, VIEW_TYPE } from './SpecoratorView'
import { AgentSidepanelView, VIEW_TYPE_AGENT } from './AgentSidepanelView'
import { SpecoratorSettingTab } from './settings'
import { promoteLegacyFlatSettings } from './loadSettings-migrate'
import { migrateProviderSelection } from '@/application/migration/migrateProviderSelection'
import { ensureLeafLoaded } from './leafLoader'
import { selectTransport } from './transport/TransportSelector'
import { buildProviderRegistry } from './transport/buildProviderRegistry'
import type { TransportSelection } from './SpecoratorView'
import { DEFAULT_SETTINGS, type PluginSettings } from '@/domain/settings/PluginSettings'
import type { ProviderRegistry } from '@/domain/chat/ProviderRegistry'
import type { ChatThreadRecord } from '@/domain/chat/ChatThreadRecord'
import {
  decodeChatThreadsBlob,
  encodeChatThreadsBlob,
} from './chatThreadsPersistence'
import { ObsidianBridge } from '@/infrastructure/obsidian/ObsidianBridge'
import { ObsidianConfirmModalAdapter } from '@/infrastructure/obsidian/ObsidianConfirmModalAdapter'
import { ObsidianMcpServerAdapter } from '@/infrastructure/obsidian/ObsidianMcpServerAdapter'
import { ObsidianMetadataCacheAdapter } from '@/infrastructure/obsidian/ObsidianMetadataCacheAdapter'
import { ObsidianCanvasAdapter } from '@/infrastructure/obsidian/ObsidianCanvasAdapter'
import { ObsidianSecretStoreAdapter } from '@/infrastructure/obsidian/ObsidianSecretStoreAdapter'
import { ClaudeCliAdapter } from '@/infrastructure/obsidian/ClaudeCliAdapter'
import { ClaudeSubprocessAdapter, type SpawnFn } from '@/infrastructure/obsidian/ClaudeSubprocessAdapter'
import { ClaudeBinaryResolver, type SpawnFn as ResolverSpawnFn } from '@/infrastructure/obsidian/ClaudeBinaryResolver'
import { CursorBinaryResolver } from '@/infrastructure/obsidian/CursorBinaryResolver'
import { CursorCliAdapter } from '@/infrastructure/obsidian/CursorCliAdapter'
import { degradedClaudeCliPort } from '@/infrastructure/bridge/degradedClaudeCliPort'
import { FeatureRepository } from '@/infrastructure/bridge/FeatureRepository'
import { FeedbackService } from '@/application/shared/FeedbackService'
import { tryAsync } from '@/domain/shared/tryAsync'
import { PluginCore } from '@/core/plugin-core'
import { ALL_MODULES, type ModuleDescriptor } from '@/modules'
import { i18nMerge, i18nTranslate, setLocale, type SupportedLocale } from '@/ui/i18n'
import type { SecretStorePort, TranslationPort } from '@/domain/ports'
import { SECRET_ID_ANTHROPIC, SECRET_ID_CURSOR } from '@/domain/ports'
import { CursorApiAdapter } from '@/infrastructure/cursor/CursorApiAdapter'
import { useMessagesStore } from '@/ui/stores/messagesStore'

export default class SpecoratorPlugin extends Plugin {
  settings: PluginSettings = { ...DEFAULT_SETTINGS }
  core: PluginCore | null = null
  bridge: ObsidianBridge | null = null
  /**
   * Secret-store adapter wrapping `App.secretStorage` (desktop ≥1.11.4).
   * `available === false` on mobile and older desktop builds; consumers
   * fall through to the degraded transport via the empty `_apiKeyCache`.
   * Constructed in `loadSettings()` before any consumer needs the key.
   */
  secretStore: SecretStorePort | null = null
  /**
   * Synchronous Anthropic-API-key cache hydrated from `secretStore` at
   * `loadSettings()` time. `ClaudeCliAdapter` and the `selectTransport`
   * closure close over the `_apiKeyCache.trim() !== ''` projection so the
   * SPEC-ASM-001 §3.1 synchronous purity invariant holds — the async
   * `secretStorage.getSecret()` is never called on a chat hot path.
   *
   * Refreshed by `refreshApiKeyCache()` after the settings tab persists a
   * new value (T-CCS-037).
   */
  private _apiKeyCache = ''

  /**
   * Synchronous Cursor-API-key cache hydrated from `secretStore` at
   * `loadSettings()` time (WS-4 / REQ-MPS-013). Mirrors `_apiKeyCache` so
   * the selector availability projection (`cursorApiKeyPresent`) stays
   * synchronous on the chat hot path. Refreshed via `refreshCursorKeyCache()`
   * after the settings tab persists a new value.
   */
  private _cursorKeyCache = ''

  /** Full stored data blob: specorator sub-key + per-module sub-keys + _moduleVersions. */
  private _storedData: Record<string, unknown> = {}
  /** ClaudeCliAdapter instance — created in onload(), destroyed in onunload(). */
  private _claudeCliAdapter: ClaudeCliAdapter | null = null
  /**
   * Cursor public-API adapter — created in onload() after the secret store
   * is hydrated. Reads the key per call from `secretStore`; `cursorApiPreview`
   * gates availability (REQ-MPS-014).
   */
  private _cursorApiAdapter: CursorApiAdapter | null = null
  /**
   * Subscription-transport adapter — created in onload(), shut down in
   * onunload() via `this.register(() => adapter.shutdown())`.
   * Satisfies SPEC-ASM-001 §9.1.
   */
  private _subscriptionAdapter: ClaudeSubprocessAdapter | null = null
  /**
   * Cursor CLI subscription adapter — WS-5 (T-MPS-065). Lifecycle mirrors
   * `_subscriptionAdapter`: created in `onload()`, pre-warmed on
   * `onLayoutReady`, torn down via `this.register(() => adapter.shutdown())`.
   * Satisfies REQ-MPS-007 / REQ-MPS-015.
   */
  private _cursorCliAdapter: CursorCliAdapter | null = null
  /**
   * Production-grade `ConfirmModalPort` (REQ-ASM-044, ADR-0032). Constructed
   * once in `onload()` and provided to Vue via `SpecoratorView`'s options bag
   * so the proposal-flow accept-confirmation prompt can be rendered without
   * leaking `obsidian` imports into the UI layer. Satisfies SPEC-ASM-001 §9.1.
   */
  private _confirmModalAdapter: ObsidianConfirmModalAdapter | null = null
  /** SpecoratorView instance — set when the registered view factory runs. */
  private _specoratorView: SpecoratorView | null = null
  /**
   * AgentSidepanelView instance — set when its registered view factory runs.
   * Hosts the dedicated agent chat sidepanel (IDEA-ASV-001 / specs/
   * agent-sidepanel-v2). Owns its own Vue app + Pinia, separate from the
   * tabbed `SpecoratorView`.
   */
  private _agentSidepanelView: AgentSidepanelView | null = null

  /**
   * Initial `chatThreads` records hydrated from plugin data at `loadSettings()`
   * (SPEC-ASM-001 §9.3, ADR-0031). Read by `SpecoratorView.onOpen()` to seed
   * the Pinia chat store and reset on each successful read. Malformed records
   * are filtered out at decode time and logged at `warn` (SPEC §11.3).
   */
  private _initialChatThreads: ReadonlyArray<ChatThreadRecord> = []
  /** Debounced persistence timer for `chatThreads`. SPEC §9.3 / OQ-ASM-T1. */
  private _chatThreadsFlushTimer: number | null = null
  /**
   * Latest snapshot scheduled by `scheduleChatThreadsPersistence` but not yet
   * flushed to plugin data. Kept on the class so `onunload()` can perform a
   * final synchronous flush before the debounce timer fires — without this,
   * a message sent within the 1 s debounce window before Obsidian exits or
   * the plugin is disabled would silently fail to persist (Codex P1, PR #346).
   */
  private _pendingChatThreadsSnapshot: ReadonlyMap<string, ChatThreadRecord> | null = null
  /**
   * Tail of the chat-thread flush chain. Each new flush is chained off the
   * previous one's settled promise so writes are strictly serialised: an
   * older snapshot can never resolve AFTER a newer snapshot and clobber it
   * (Codex P1, PR #350). Initialised to a settled promise so the first
   * flush attaches without an extra branch.
   */
  private _chatThreadsFlushQueue: Promise<void> = Promise.resolve()
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
    // so it does not hold up the critical onload() path. The Anthropic API
    // key is sourced from `_apiKeyCache` (hydrated from `SecretStorePort` in
    // `loadSettings()`); the sync accessor keeps the SDK call sites off the
    // async keychain path.
    this._claudeCliAdapter = new ClaudeCliAdapter(
      () => this._apiKeyCache,
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

    // T-MPS-065 / SPEC-MPS-001 §6 — Cursor CLI adapter. Constructs a fresh
    // `CursorBinaryResolver` per resolve so PATH changes between Settings-tab
    // clicks are honoured (mirror of the Claude resolver discipline).
    this._cursorCliAdapter = new CursorCliAdapter({
      getSettings: () => this.settings,
      logger: this.bridge,
      resolveCliPath: () => new CursorBinaryResolver({
        spawn: resolverSpawnFn,
        platform: resolverPlatform,
      }).resolve(),
      spawn: spawnFn,
    })
    this.register(() => { this._cursorCliAdapter?.shutdown() })

    // WS-4 (T-MPS-053) — Cursor API adapter. Reads SECRET_ID_CURSOR through
    // `secretStore` on every queryStream() call (REQ-MPS-013); availability
    // is gated by `cursorApiPreview` (REQ-MPS-014). The base URL is the
    // RES-MPS-001 placeholder and will be swapped once CQ-MPS-01 closes
    // upstream.
    if (this.secretStore !== null) {
      this._cursorApiAdapter = new CursorApiAdapter({
        secretStore: this.secretStore,
        logger: this.bridge,
        // eslint-disable-next-line obsidianmd/prefer-active-doc -- network `fetch` is a global, not a DOM API; the rule false-positives here.
        fetch: globalThis.fetch.bind(globalThis),
        baseUrl: 'https://api.cursor.sh/v1',
        getSettings: () => this.settings,
      })
    }

    // T-ASM-075 / SPEC-ASM-001 §9.1 — production-grade confirmation modal.
    // Stateless wrapper; no startup() / shutdown() required. Constructed here
    // so SpecoratorView can provide it under `CONFIRM_MODAL_PORT` (§9.5).
    this._confirmModalAdapter = new ObsidianConfirmModalAdapter(this.app)

    this.registerView(VIEW_TYPE, (leaf) => {
      const view = new SpecoratorView(leaf, this, this._claudeCliAdapter!, {
        subscriptionAdapter: this._subscriptionAdapter!,
        confirmModalAdapter: this._confirmModalAdapter!,
        // WP-12: lifecycle is its own port; pass the adapter instances under
        // their `TransportLifecyclePort` contract so the view can `startup()`
        // them on settings bumps without depending on `ChatTransportPort`.
        sdkLifecycle: this._claudeCliAdapter!,
        subscriptionLifecycle: this._subscriptionAdapter!,
        selectTransport: (settings) => this._routeTransport(settings),
      })
      this._specoratorView = view
      return view
    })

    // IDEA-ASV-001 — dedicated agent sidepanel view. Single-purpose: hosts
    // the chat UI without the tabbed shell. Reuses the same transport
    // selector + adapters as the legacy embed so behaviour is bit-for-bit
    // preserved.
    this.registerView(VIEW_TYPE_AGENT, (leaf) => {
      const view = new AgentSidepanelView(leaf, this, this._claudeCliAdapter!, {
        subscriptionAdapter: this._subscriptionAdapter!,
        confirmModalAdapter: this._confirmModalAdapter!,
        sdkLifecycle: this._claudeCliAdapter!,
        subscriptionLifecycle: this._subscriptionAdapter!,
        selectTransport: (settings) => this._routeTransport(settings),
      })
      this._agentSidepanelView = view
      return view
    })

    this.addRibbonIcon('layout-dashboard', 'Open Specorator', () => {
      void this.activateView()
    })

    this.addRibbonIcon('bot', 'Open Specorator agent', () => {
      void this.activateAgentSidepanel()
    })

    this.addCommand({
      // Keep the original command id so existing hotkeys and automations survive upgrades.
      // eslint-disable-next-line obsidianmd/commands/no-plugin-id-in-command-id
      id: 'open-specorator',
      name: 'Open panel',
      callback: () => void this.activateView(),
    })

    this.addCommand({
       
      id: 'open-agent-sidepanel',
      name: 'Open agent sidepanel',
      callback: () => void this.activateAgentSidepanel(),
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
    // Targets the dedicated agent sidepanel (IDEA-ASV-001) — the chat
    // store now lives in `_agentSidepanelView.pinia`, not the tabbed
    // `_specoratorView`.
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (!(file instanceof TFile)) return
        menu.addItem((item) => {
          item
            .setTitle('Add to chat context')
            .setIcon('message-square-plus')
            .onClick(() => {
              void this.activateAgentSidepanel().then(() => {
                if (this._agentSidepanelView?.pinia) {
                  const messagesStore = useMessagesStore(this._agentSidepanelView.pinia)
                  messagesStore.addContextFile({ path: file.path, label: file.name, isAuto: false })
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
        if (this._agentSidepanelView?.pinia) {
          const messagesStore = useMessagesStore(this._agentSidepanelView.pinia)
          if (activeFile) {
            messagesStore.setActiveFile({ path: activeFile.path, label: activeFile.name, isAuto: true })
          } else {
            messagesStore.setActiveFile(null)
          }
        }
      }),
    )

    this.registerObsidianProtocolHandler('specorator', (params) => {
      const searchParams = new URLSearchParams(Object.entries(params))
      if (this.core?.handleUri(searchParams) === true) return

      // The `open-chat`/`focus-chat` URI actions historically navigated the
      // tabbed view to `/chat`. v2 routes them to the dedicated agent
      // sidepanel so external integrations (Obsidian Web, URI bookmarks)
      // continue to work without changes (IDEA-ASV-001).
      const action = params.action
      if (action === 'open-chat' || action === 'focus-chat' || action === 'open-agent') {
        void this.activateAgentSidepanel()
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
      // its own failures internally (REQ-ASM-009, NFR-ASM-006). Once startup
      // resolves, bump the settings version so any already-open
      // SpecoratorView re-runs `selectTransport()` with the freshly-resolved
      // CLI availability — without this, a cold-load panel that mounted
      // before startup finished stays stuck on the initial `isAvailableSync`
      // snapshot (Codex P1, PR #350).
      void Promise.all([
        this._claudeCliAdapter?.startup(),
        this._subscriptionAdapter?.startup(),
        this._cursorCliAdapter?.startup(),
      ]).then(() => {
        this._specoratorView?.bumpSettingsVersion()
        this._agentSidepanelView?.bumpSettingsVersion()
      })
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
    // Cancel the pending debounce — we're about to flush directly below.
    if (this._chatThreadsFlushTimer !== null) {
      activeWindow.clearTimeout(this._chatThreadsFlushTimer)
      this._chatThreadsFlushTimer = null
    }
    // Final synchronous flush of any snapshot scheduled within the debounce
    // window but not yet written. Without this, a message sent immediately
    // before Obsidian exits / the plugin is disabled would be lost (Codex P1,
    // PR #346). `_flushChatThreads` is async; onunload() is fire-and-forget
    // per Obsidian's contract, so void is correct here.
    if (this._pendingChatThreadsSnapshot !== null) {
      const snapshot = this._pendingChatThreadsSnapshot
      this._pendingChatThreadsSnapshot = null
      // Tail-chain so an in-flight debounced flush finishes before this
      // final write (Codex P1, PR #350). Without this, the final flush
      // could race a still-resolving prior flush and lose its update.
      this._chatThreadsFlushQueue = this._chatThreadsFlushQueue
        .catch(() => undefined)
        .then(() => this._flushChatThreads(snapshot))
      void this._chatThreadsFlushQueue
    }
    this.app.workspace.detachLeavesOfType(VIEW_TYPE)
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_AGENT)
    this.bridge?.hideAllNotices()
    // onunload() is synchronous (Obsidian contract). destroy() is fire-and-forget;
    // module destroy() implementations must be fast and non-critical.
    void this.core?.destroy()
  }

  async loadSettings(): Promise<void> {
    const stored = (await this.loadData()) as Record<string, unknown> | null
    const raw: Record<string, unknown> = { ...(stored ?? {}) }

    this._storedData = promoteLegacyFlatSettings(raw)

    // SPEC-MPS-001 §3 / REQ-MPS-004 / REQ-MPS-005 — translate the v0.x
    // `transportKind` + string `transport` encoding into the v1
    // `providerSelection` + `{ provider, mode }` discriminator BEFORE any
    // adapter wiring reads `this.settings` or hydrates `chatThreads`.
    await this._runProviderSelectionMigration()

    this.settings = {
      ...DEFAULT_SETTINGS,
      ...((this._storedData.specorator ?? {}) as Partial<PluginSettings>),
    }

    await this._initializeSecretStore()

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
   * Construct the secret-store adapter and hydrate `_apiKeyCache` from it.
   * On desktop ≥1.11.4 `app.secretStorage` is present and any previously
   * stored Anthropic key is loaded into the cache. On mobile / older
   * desktop builds `available === false` and the cache stays empty — chat
   * falls back to degraded mode (see settings tab).
   *
   * Codex P1 on PR #393: keychain reads can reject (locked keychain, OS
   * denial, transient platform error). Mirror the `setSecret` wrap and
   * degrade to an empty cache on rejection so plugin startup never aborts
   * for a transient OS-keychain failure.
   */
  private async _initializeSecretStore(): Promise<void> {
    this.secretStore = new ObsidianSecretStoreAdapter(this.app)
    this._apiKeyCache = await this._readSecretSafe(this.secretStore, SECRET_ID_ANTHROPIC)
    this._cursorKeyCache = await this._readSecretSafe(this.secretStore, SECRET_ID_CURSOR)
  }

  /**
   * SPEC-MPS-001 §3 / REQ-MPS-004 / REQ-MPS-005 — translate any v0.x
   * `transportKind` + string-transport encoding inside `_storedData.specorator`
   * to the v1 `providerSelection` + discriminated `{ provider, mode }` shape.
   * Pure migration; idempotent (NFR-MPS-006). On `migrated === true` the
   * translated blob is persisted via `saveData()` so the legacy keys never
   * re-enter the boot path. The migration function does not throw, but
   * `tryAsync` adds defence-in-depth against future regressions: a thrown
   * error is logged and migration is skipped, but startup continues.
   */
  private async _runProviderSelectionMigration(): Promise<void> {
    const outcome = await tryAsync(async () => {
      const specoratorBefore = (this._storedData.specorator ?? {}) as Record<string, unknown>
      const migration = migrateProviderSelection({
        settings: specoratorBefore,
        chatThreads: specoratorBefore.chatThreads as Record<string, unknown> | undefined,
      })
      for (const err of migration.errors) {
        console.warn('[migrateProviderSelection]', err)
      }
      if (!migration.migrated) return
      const nextSpecorator: Record<string, unknown> = {
        ...(migration.data.settings ?? {}),
      }
      if (migration.data.chatThreads !== undefined) {
        nextSpecorator.chatThreads = migration.data.chatThreads
      }
      this._storedData = { ...this._storedData, specorator: nextSpecorator }
      await this.saveData(this._storedData)
    })
    if (!outcome.ok) {
      console.error('[migrateProviderSelection] threw unexpectedly', outcome.error)
    }
  }

  /**
   * Read-only accessor exposing the cached Anthropic API key for callers
   * that need a sync value (settings UI test hooks, transport selector
   * closures). Returns `''` when no key is configured or when running on a
   * build without `App.secretStorage`.
   */
  getApiKeyCache(): string {
    return this._apiKeyCache
  }

  /**
   * Re-read the Anthropic API key from {@link secretStore} after the settings
   * tab persists a new value, and bump the in-view settings version so
   * `ChatSidebar` re-checks adapter availability. Safe to call when the views
   * are closed (the bump is a no-op).
   */
  async refreshApiKeyCache(): Promise<void> {
    if (this.secretStore === null) return
    this._apiKeyCache = await this._readSecretSafe(this.secretStore, SECRET_ID_ANTHROPIC)
    this._specoratorView?.bumpSettingsVersion()
    this._agentSidepanelView?.bumpSettingsVersion()
  }

  /**
   * Read-only accessor for the cached Cursor API key. Mirrors
   * {@link getApiKeyCache} so the settings tab can pre-populate the password
   * field at render time. Returns `''` on unavailable secret stores.
   */
  getCursorKeyCache(): string {
    return this._cursorKeyCache
  }

  /**
   * Re-read the Cursor API key from {@link secretStore} after the settings
   * tab persists a new value. Mirrors {@link refreshApiKeyCache}.
   */
  async refreshCursorKeyCache(): Promise<void> {
    if (this.secretStore === null) return
    this._cursorKeyCache = await this._readSecretSafe(this.secretStore, SECRET_ID_CURSOR)
    this._specoratorView?.bumpSettingsVersion()
    this._agentSidepanelView?.bumpSettingsVersion()
  }

  /**
   * Read the Anthropic key from the secret store with defensive handling.
   * Codex P1 on PR #393: keychain reads can fail (locked keychain, OS
   * denial, transient platform error) and must not crash the plugin —
   * degrading to "no key" matches the unavailable-store branch.
   */
  private async _readSecretSafe(
    secretStore: SecretStorePort,
    id: string,
  ): Promise<string> {
    if (!secretStore.available) return ''
    const outcome = await tryAsync(() => secretStore.getSecret(id))
    if (!outcome.ok) {
      this.bridge?.warn('main.secretStorage.read.failed', { error: outcome.error, id })
      return ''
    }
    return outcome.value ?? ''
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
    this._pendingChatThreadsSnapshot = snapshot
    // Refresh the rehydrate-on-reopen snapshot so a panel close/reopen in the
    // same plugin session sees the latest threads, not the stale set captured
    // at `loadSettings()` time (Codex P1, PR #350). Without this, reopening
    // the panel after thread mutations would restore the stale map and the
    // next mutation would persist it back, losing newer conversations.
    this._initialChatThreads = Array.from(snapshot.values())
    if (this._chatThreadsFlushTimer !== null) {
      activeWindow.clearTimeout(this._chatThreadsFlushTimer)
    }
    this._chatThreadsFlushTimer = activeWindow.setTimeout(() => {
      this._chatThreadsFlushTimer = null
      this._pendingChatThreadsSnapshot = null
      // Serialise via the tail-chained queue so older snapshots can never
      // resolve after newer ones (Codex P1, PR #350). `.catch(() => undefined)`
      // keeps the chain alive past a transient saveData failure — the next
      // flush should still attempt to write, not be silently swallowed by a
      // rejected predecessor.
      this._chatThreadsFlushQueue = this._chatThreadsFlushQueue
        .catch(() => undefined)
        .then(() => this._flushChatThreads(snapshot))
      void this._chatThreadsFlushQueue
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
    // Merge into the existing specorator blob rather than overwriting it.
    // Sibling keys under `specorator` (e.g. `chatThreads` from
    // `_persistChatThreads`) must survive a settings save (Codex P1, PR #350);
    // a bare `{ ...validated }` here would drop them and the next plugin
    // reload couldn't restore prior chat sessions.
    const currentSpecorator = (this._storedData.specorator ?? {}) as Record<string, unknown>
    this._storedData = {
      ...this._storedData,
      specorator: { ...currentSpecorator, ...validated },
    }
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

  /**
   * Open (or reveal) the dedicated Specorator agent sidepanel
   * (IDEA-ASV-001 / `VIEW_TYPE_AGENT`). Mirrors `activateView()` but targets
   * the agent leaf. Defaults to the right sidebar to match the Obsidian
   * sidepanel idiom; if a user moved the leaf elsewhere it stays there.
   */
  async activateAgentSidepanel(): Promise<void> {
    const { workspace } = this.app

    const existing = workspace.getLeavesOfType(VIEW_TYPE_AGENT)
    if (existing.length > 0) {
      await ensureLeafLoaded(existing[0])
      void workspace.revealLeaf(existing[0])
      return
    }

    const leaf = workspace.getRightLeaf(false)
    if (leaf === null) return
    await leaf.setViewState({ type: VIEW_TYPE_AGENT, active: true })
    void workspace.revealLeaf(leaf)
  }

  /**
   * WS-3 (T-MPS-033) — bridge the new {@link selectTransport} (SPEC-MPS-001
   * §4) shape back to the legacy `{port, kind}` snapshot consumed by
   * `SpecoratorView` / `AgentSidepanelView`. The 15-row truth table runs on
   * the new `ProviderSelection` discriminator; the view layer still drives
   * `TransportKind` because its parity surface (REQ-CCS-*) predates Cursor.
   *
   * `claude/api` → `'api-key'`, `claude/cli` → `'subscription'`,
   * `cursor/*` → `'degraded'` for now (WS-4/WS-5 will replace once the Cursor
   * adapters land), `'degraded'` → `'degraded'`.
   */
  private _routeTransport(settings: PluginSettings): TransportSelection {
    const cursorApiPort = this._cursorApiAdapter ?? degradedClaudeCliPort
    const result = selectTransport(settings.providerSelection, {
      providers: {
        claude: { api: this._claudeCliAdapter!, cli: this._subscriptionAdapter! },
        cursor: { api: cursorApiPort, cli: this._cursorCliAdapter! },
      },
      degradedPort: degradedClaudeCliPort,
      availability: {
        // Synchronous projection of `SecretStorePort.getSecret(...)` captured
        // in `_apiKeyCache`. Re-read on every selector call so a key saved
        // mid-session is honoured.
        claudeApiKeyPresent: this._apiKeyCache.trim() !== '',
        // Synchronous projection — see SPEC-ASM-001 §3.1 closing note and
        // `ClaudeSubprocessAdapter.isAvailableSync()`.
        claudeCliResolved: this._subscriptionAdapter!.isAvailableSync(),
        // WS-4 (T-MPS-053): Cursor API key presence projected from
        // `_cursorKeyCache` (mirror of SECRET_ID_CURSOR), late-read on every
        // selector call. WS-5: `cursorCliResolved` from real
        // `CursorCliAdapter.isAvailableSync()`.
        cursorApiKeyPresent: this._cursorKeyCache.trim() !== '',
        cursorCliResolved: this._cursorCliAdapter?.isAvailableSync() ?? false,
        cursorApiPreviewEnabled: settings.cursorApiPreview,
        secretStoreAvailable: this.secretStore?.available ?? false,
      },
      autoPreferProvider: settings.autoPreferProvider,
    })
    return this._mapResolvedToTransportSelection(result)
  }

  /**
   * Pure projection: collapse `selectTransport`'s `(provider, mode)` result
   * into the legacy `TransportSelection` shape consumed by the view layer.
   * WS-5: cursor/cli flows through under the `subscription` kind until the
   * view learns the `(provider, mode)` discriminator (deferred to WS-10).
   */
  private _mapResolvedToTransportSelection(
    result: ReturnType<typeof selectTransport>,
  ): TransportSelection {
    if (result.resolved === 'degraded') {
      return { port: result.port, kind: 'degraded' }
    }
    const { provider, mode } = result.resolved
    if (provider === 'claude' && mode === 'api') {
      return { port: result.port, kind: 'api-key' }
    }
    if (provider === 'claude' && mode === 'cli') {
      return { port: result.port, kind: 'subscription' }
    }
    if (provider === 'cursor' && mode === 'cli') {
      return { port: result.port, kind: 'subscription' }
    }
    if (provider === 'cursor' && mode === 'api') {
      // Cursor API behaves like an API-key transport from the view's POV
      // until the view learns the (provider, mode) discriminator (deferred
      // to WS-10).
      return { port: result.port, kind: 'api-key' }
    }
    // Defensive fallback so the view never sees `undefined`.
    return { port: degradedClaudeCliPort, kind: 'degraded' }
  }

  /**
   * WS-3 (T-MPS-033) — lazy `ProviderRegistry` accessor. The registry is
   * pure metadata (REQ-MPS-006 / NFR-MPS-003) and safe to construct on
   * first access. `SpecoratorView` / `AgentSidepanelView` provide it under
   * `PROVIDER_REGISTRY_KEY` so the UI's `useProviderRegistry` composable can
   * inject it.
   */
  private _providerRegistry: ProviderRegistry | null = null
  getProviderRegistry(): ProviderRegistry {
    let registry = this._providerRegistry
    if (registry === null) {
      registry = buildProviderRegistry()
      this._providerRegistry = registry
    }
    return registry
  }
}
