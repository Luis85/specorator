import { ItemView, Platform, type WorkspaceLeaf } from 'obsidian'
import { createApp, ref, watch, type App as VueApp, type Ref } from 'vue'
import { createPinia, type Pinia } from 'pinia'
import type { Router } from 'vue-router'
import { router } from '@/ui/router'
import { i18n, setLocale, type SupportedLocale } from '@/ui/i18n'
import AppRoot from '@/ui/AppRoot.vue'
import {
  SETTINGS_PORT,
  VAULT_PORT,
  WORKSPACE_PORT,
  NOTIFICATION_PORT,
  LOGGER_PORT,
  CHAT_TRANSPORT_PORT,
  PROVIDER_REGISTRY_KEY,
  COMMUNITY_PLUGIN_PORT,
  CONFIRM_MODAL_PORT,
  SECRET_STORE_PORT,
  IS_MOBILE_KEY,
  SETTINGS_VERSION_KEY,
  TRANSPORT_KIND_KEY,
  OPEN_PLUGIN_SETTINGS_KEY,
} from '@/infrastructure/bridge/ports'
import { FeatureRepository } from '@/infrastructure/bridge/FeatureRepository'
import { FeatureService } from '@/application/feature/FeatureService'
import { FeedbackService } from '@/application/shared/FeedbackService'
import { FEATURE_SERVICE_KEY } from '@/ui/composables/useFeatureService'
import type { ChatTransportPort, ConfirmModalPort, TransportLifecyclePort } from '@/domain/ports'
import type { PluginSettings } from '@/domain/settings/PluginSettings'
import type { TransportKind } from '@/domain/chat/TransportKind'
import type { ChatTransportPort as _ChatTransportPort } from '@/domain/ports/ChatTransportPort'

/**
 * Legacy `{ port, kind }` snapshot consumed by the view's reactive state.
 * `kind` is derived in `main.ts` from the new
 * `TransportResolution.resolved` (see `resolutionToLegacyKind`). Keeping the
 * type local to the view layer avoids leaking the deprecated `TransportKind`
 * vocabulary back into `TransportSelector.ts` (REQ-MPS-007 / NFR-MPS-003).
 */
export interface TransportSelection {
  readonly port: _ChatTransportPort
  readonly kind: TransportKind
}
import { useChatThreadsStore } from '@/ui/stores/chatThreadsStore'
import { useMessagesStore } from '@/ui/stores/messagesStore'
import { mostRecentlyUsedThreadId } from './chatThreadsPersistence'
import { trySync } from '@/domain/shared/tryAsync'
import type SpecoratorPlugin from './main'

/**
 * Factory closure provided by `main.ts` (SPEC-ASM-001 §9.1). Encapsulates the
 * four candidate ports + `cliResolved` snapshot so the view only needs to pass
 * current settings to obtain a `TransportSelection`.
 */
export type SelectTransportFactory = (settings: PluginSettings) => TransportSelection

/**
 * Constructor options bag accepted by `SpecoratorView`. Optional so existing
 * callers (and the legacy direct-port path) continue to compile while the
 * subscription wiring rolls out.
 */
export interface SpecoratorViewOptions {
  readonly subscriptionAdapter: ChatTransportPort
  readonly selectTransport: SelectTransportFactory
  /**
   * Production-grade modal adapter (`ObsidianConfirmModalAdapter`) constructed
   * in `main.ts`'s `onload()` (SPEC-ASM-001 §9.1). Provided to Vue under
   * `CONFIRM_MODAL_PORT` so `ChatSidebar`'s proposal-confirmation flow can
   * prompt the user without importing `obsidian` (REQ-ASM-044, ADR-0032).
   *
   * Optional so unit tests that exercise the view without proposal flows can
   * continue to omit it; the provide is still issued unconditionally below
   * (Vue tolerates `undefined`).
   */
  readonly confirmModalAdapter?: ConfirmModalPort
  /**
   * Lifecycle handles for the SDK and subscription transports. WP-12 split
   * `startup`/`shutdown` off `ChatTransportPort` onto the dedicated
   * `TransportLifecyclePort`. The plugin layer owns the adapter instances
   * and passes the same objects under both contracts. Optional so legacy
   * test wiring that omitted lifecycle continues to compile; missing
   * handles result in a no-op refresh.
   */
  readonly sdkLifecycle?: TransportLifecyclePort
  readonly subscriptionLifecycle?: TransportLifecyclePort
}

export const VIEW_TYPE = 'specorator'

export class SpecoratorView extends ItemView {
  private vueApp: VueApp | null = null
  private _onUnhandledRejection: ((e: PromiseRejectionEvent) => void) | null = null
  private _routerErrorCleanup: (() => void) | null = null
  private _router: Router | null = null

  /**
   * Exposed so main.ts can access the Pinia instance to call store actions
   * (e.g. addFile, setActiveFile) from Obsidian event handlers.
   * Set in onOpen() after createPinia().
   * Satisfies T-CCS-035.
   */
  public pinia: Pinia | null = null

  /**
   * Reactive counter. Incremented by bumpSettingsVersion() each time the
   * Anthropic API key is saved in Settings. ChatSidebar watches this to
   * re-check adapter availability. Satisfies D-CCS-003, T-CCS-037.
   */
  private readonly _settingsVersion = ref(0)

  /**
   * Reactive holder for the active `ChatTransportPort`. Mutated by
   * `_refreshActivePort()` whenever settings change (gated by REQ-ASM-003 —
   * skipped while a chat turn is in flight). Provided to Vue under
   * `CHAT_TRANSPORT_PORT` so UI consumers stay transport-agnostic.
   *
   * Satisfies REQ-ASM-001, REQ-ASM-002, REQ-ASM-003.
   */
  private readonly _activeClaudeCliPort: Ref<ChatTransportPort>

  /**
   * Reactive holder for the resolved `TransportKind`. Mirrors
   * `selectTransport(settings).kind` and is refreshed by `_refreshActivePort()`
   * (REQ-ASM-002). Provided to Vue under `TRANSPORT_KIND_KEY` so
   * `ChatSidebar`'s `TransportStatusPill` and degraded-template branches
   * re-render reactively when the user switches transport (SPEC §10.1).
   */
  private readonly _activeTransportKind: Ref<TransportKind>

  /**
   * Optional subscription-transport adapter + selector closure passed by the
   * plugin (SPEC-ASM-001 §9.1). When absent, the view falls back to the legacy
   * direct-port path for backwards compatibility with existing tests.
   */
  private readonly _options: SpecoratorViewOptions | null

  /**
   * Set by `bumpSettingsVersion()` when called mid-turn (status === 'loading').
   * The watcher installed in `onOpen()` consumes the flag when the chat
   * status transitions back out of 'loading' and applies the deferred
   * transport refresh (Codex P1, PR #350). Without this, a settings change
   * made during a long-running request would silently never apply until
   * the user saved settings again or reloaded the plugin.
   */
  private _pendingSettingsRefresh = false

  /** Disposer for the chat-status watcher; set in `onOpen()`, called in `onClose()`. */
  private _statusWatchStop: (() => void) | null = null

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: SpecoratorPlugin,
    private readonly claudeCliPort: ChatTransportPort,
    options?: SpecoratorViewOptions,
  ) {
    super(leaf)
    this._options = options ?? null
    // Seed the reactive port: when a selector is provided, derive from
    // settings; otherwise fall back to the directly-injected SDK adapter.
    const initialSelection = this._options !== null
      ? this._options.selectTransport(this.plugin.settings)
      : null
    const initialPort = initialSelection !== null
      ? initialSelection.port
      : this.claudeCliPort
    this._activeClaudeCliPort = ref(initialPort)
    // When no selector is wired (legacy path), default the kind to 'degraded'
    // — UI consumers reading `TRANSPORT_KIND_KEY` see a concrete value and
    // never `undefined`.
    const initialKind: TransportKind = initialSelection !== null
      ? initialSelection.kind
      : 'degraded'
    this._activeTransportKind = ref(initialKind)
  }

  getViewType(): string { return VIEW_TYPE }
  getDisplayText(): string { return 'Specorator' }
  getIcon(): string { return 'layout-dashboard' }

  onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement
    container.empty()

    const mountPoint = container.createDiv({
      cls: 'specorator-root',
      attr: { id: 'specorator-root', style: 'height:100%;overflow:auto;' },
    })

    const bridge = this.plugin.bridge!

    setLocale(this.plugin.settings.locale as SupportedLocale)

    this.pinia = createPinia()

    // SPEC-ASM-001 §9.5 / REQ-ASM-037 — hydrate persisted chat threads into
    // the Pinia chat store before the view mounts. The plugin decoded the
    // blob during `loadSettings()`; malformed records were already filtered
    // out and logged at `warn`. `activeThreadId` is seeded to the most
    // recently used record so the chat sidebar resumes the user's last
    // conversation. Subscribe to subsequent mutations so any change to
    // `chatThreads` triggers a debounced flush back to plugin data.
    const persisted = this.plugin.getInitialChatThreads()
    const threadsStore = useChatThreadsStore(this.pinia)
    for (const record of persisted) threadsStore.upsertThread(record)
    threadsStore.setActiveThreadId(mostRecentlyUsedThreadId(persisted))
    threadsStore.$subscribe((_mutation, state) => {
      this.plugin.scheduleChatThreadsPersistence(state.chatThreads)
    })

    this._installPendingRefreshWatcher()

    this.vueApp = createApp(AppRoot)
    this.vueApp.use(this.pinia)
    this.vueApp.use(router)
    this.vueApp.use(i18n)
    this.vueApp.provide(SETTINGS_PORT, bridge)
    this.vueApp.provide(VAULT_PORT, bridge)
    this.vueApp.provide(WORKSPACE_PORT, bridge)
    this.vueApp.provide(NOTIFICATION_PORT, bridge)
    this.vueApp.provide(LOGGER_PORT, bridge)
    // Refresh the active port from the current settings just before mounting
    // so the first frame already reflects any setting changes since ctor.
    this._refreshActivePort()
    // Provide a Proxy that forwards every property access (including method
    // calls) to `this._activeClaudeCliPort.value`. The reactive ref's value
    // can rotate between renders (e.g. when `bumpSettingsVersion()` re-runs
    // selectTransport), so we cannot freeze a snapshot at mount time — that
    // would leave UI consumers on a stale adapter after transport switches.
    // Methods are bound to the current adapter so their internal `this`
    // references still resolve correctly. UI consumers see a normal
    // `ChatTransportPort` and need no changes (SPEC §9.5).
    const ref = this._activeClaudeCliPort
    const reactivePort = new Proxy({} as ChatTransportPort, {
      get(_target, prop): unknown {
        const current = ref.value as unknown as Record<PropertyKey, unknown>
        const value = current[prop]
        return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(current) : value
      },
    })
    this.vueApp.provide(CHAT_TRANSPORT_PORT, reactivePort)
    // WS-3 (REQ-MPS-006) — provide the read-only ProviderRegistry built once
    // at plugin startup. The composable `useProviderRegistry` is the UI's
    // single entry point for provider metadata.
    this.vueApp.provide(PROVIDER_REGISTRY_KEY, this.plugin.getProviderRegistry())
    this.vueApp.provide(COMMUNITY_PLUGIN_PORT, bridge)
    if (this.plugin.secretStore !== null) {
      this.vueApp.provide(SECRET_STORE_PORT, this.plugin.secretStore)
    }
    // REQ-ASM-044 / SPEC-ASM-001 §9.5 — production-grade confirmation modal
    // for proposal-flow accepts. `ChatSidebar` injects this via
    // `useConfirmModalPort()` (PR-ASM-4 batch 7). The provide is
    // SPEC-ASM-001 §9.5 — provide the production confirm-modal adapter for
    // proposal-accept flows. Only registered when an adapter was supplied so
    // `useConfirmModalPort` throws a clear 'not provided' error in legacy
    // tests that omit it. Consumers reach for this only when surfacing the
    // overwrite modal in `commitFileWriteProposal` (REQ-ASM-044).
    if (this._options?.confirmModalAdapter !== undefined) {
      this.vueApp.provide(CONFIRM_MODAL_PORT, this._options.confirmModalAdapter)
    }
    // SPEC-ASM-001 §10.1 — reactive transport-kind ref. ChatSidebar consumes
    // this to drive `TransportStatusPill` + degraded-template branches.
    this.vueApp.provide(TRANSPORT_KIND_KEY, this._activeTransportKind)
    this.vueApp.provide(IS_MOBILE_KEY, Platform.isMobile)
    this.vueApp.provide(SETTINGS_VERSION_KEY, this._settingsVersion)
    // Codex P2 (PR #350): the in-app Vue `/settings` route does not expose
    // the Anthropic key or transport fields, so the chat-degraded recovery
    // CTA needs to open Obsidian's plugin settings tab directly. Capture
    // `App` + plugin id from the plugin instance and bind a no-arg
    // function ChatSidebar can call from a click handler.
    this.vueApp.provide(OPEN_PLUGIN_SETTINGS_KEY, () => {
      // `App.setting` is an Obsidian internal but is the canonical way to
      // open the settings modal from plugin code; the same pattern is used
      // by the official `obsidian-tasks` and `dataview` plugins.
      const setting = (this.plugin.app as unknown as {
        setting?: { open: () => void; openTabById: (id: string) => void }
      }).setting
      if (setting === undefined) return
      setting.open()
      setting.openTabById(this.plugin.manifest.id)
    })
    const featureFeedback = new FeedbackService(bridge, bridge)
    this.vueApp.provide(
      FEATURE_SERVICE_KEY,
      new FeatureService(new FeatureRepository(bridge, bridge), featureFeedback),
    )

    // Set errorHandler BEFORE mount() so errors thrown during initial render/setup
    // are routed through bridge.error()/showError() instead of escaping to console.
    this.vueApp.config.errorHandler = (err, _instance, info) => {
      bridge.error(`[Vue] Unhandled error in ${info}`, err)
      bridge.showError('An unexpected error occurred. Check the console for details.')
    }

    this._onUnhandledRejection = (event: PromiseRejectionEvent) => {
      bridge.error('[Unhandled rejection]', event.reason)
      bridge.showError('An unexpected error occurred. Check the console for details.')
    }
    window.addEventListener('unhandledrejection', this._onUnhandledRejection)

    // Router is a module-level singleton, so each onOpen() must unregister its handler
    // in onClose() to prevent accumulation across panel re-opens.
    this._routerErrorCleanup = router.onError((err) => {
      bridge.error('[Router] Navigation error', err)
      bridge.showError('Navigation failed. Please try again.')
    })

    this._router = router

    this.vueApp.mount(mountPoint)
    return Promise.resolve()
  }

  onClose(): Promise<void> {
    if (this._onUnhandledRejection) {
      window.removeEventListener('unhandledrejection', this._onUnhandledRejection)
      this._onUnhandledRejection = null
    }
    this._routerErrorCleanup?.()
    this._routerErrorCleanup = null
    this._router = null
    this._statusWatchStop?.()
    this._statusWatchStop = null
    this._pendingSettingsRefresh = false
    this.plugin.bridge?.hideAllNotices()
    this.vueApp?.unmount()
    this.vueApp = null
    // Drop the Pinia instance so plugin-level workspace handlers that gate on
    // `this._specoratorView?.pinia` (file-menu, active-leaf-change) stop
    // mutating a store whose Vue app has been unmounted. A fresh Pinia is
    // created on the next `onOpen()` (Codex P2, PR #350).
    this.pinia = null
    return Promise.resolve()
  }

  /**
   * Navigates the embedded Vue Router to the given path.
   * No-op if the view is not currently open.
   * Satisfies T-CCS-035 (URI handler navigation).
   */
  public navigateTo(path: string): void {
    void this._router?.push(path)
  }

  /**
   * Increments the settings-version reactive counter, signalling ChatSidebar
   * to re-check adapter availability. Called by the settings tab after the
   * Anthropic API key is saved.
   *
   * Also re-runs the transport selector when a chat turn is NOT in flight
   * (REQ-ASM-003). This is the documented mid-session lock — switching
   * transport while `status === 'loading'` would orphan an in-flight query.
   *
   * Satisfies D-CCS-003, T-CCS-037, REQ-ASM-003.
   */
  public bumpSettingsVersion(): void {
    this._settingsVersion.value++
    if (this._isChatLoading()) {
      // REQ-ASM-003 — skip transport switch while a turn is in flight. Record
      // the deferred-refresh intent; the status watcher in `onOpen()` will
      // re-invoke `_applyTransportRefresh()` when the turn ends, so the
      // user's settings change is never silently dropped (Codex P1, PR #350).
      this._pendingSettingsRefresh = true
      return
    }
    this._applyTransportRefresh()
  }

  /**
   * Install the chat-status watcher that consumes
   * `_pendingSettingsRefresh` when an in-flight turn ends (Codex P1, PR #350).
   * Called from `onOpen()`; also re-exposed (public) so unit tests can wire
   * the watcher manually after seeding `this.pinia` without going through
   * the full mount path.
   */
  public _installPendingRefreshWatcher(): void {
    if (this.pinia === null) return
    if (this._statusWatchStop !== null) return
    const messagesStore = useMessagesStore(this.pinia)
    this._statusWatchStop = watch(
      () => messagesStore.status,
      (next, prev) => {
        if (prev === 'loading' && next !== 'loading' && this._pendingSettingsRefresh) {
          this._pendingSettingsRefresh = false
          this._applyTransportRefresh()
        }
      },
      // Sync flush so the deferred refresh applies in the same microtask
      // that transitions status out of 'loading'. Without this, the
      // transport could stay stale for an extra event-loop turn (and the
      // unit test would race the scheduler).
      { flush: 'sync' },
    )
  }

  /**
   * Run the adapter `startup()` + `_refreshActivePort()` sequence. Extracted
   * from `bumpSettingsVersion()` so the chat-status watcher can apply a
   * deferred refresh when an in-flight turn ends (Codex P1, PR #350).
   */
  private _applyTransportRefresh(): void {
    // Re-run BOTH adapters' startup so a freshly-configured API key (api-key
    // path) or CLI path (subscription path) updates each port's
    // `isAvailable()` / `isAvailableSync()` before the selector reads it.
    // `startup()` is idempotent on identical inputs (Codex P1). We
    // deliberately fire-and-forget and refresh synchronously now using the
    // current cached availability; the post-startup refresh below picks up
    // any new value when each resolves.
    const sdkLifecycle = this._options?.sdkLifecycle
    if (sdkLifecycle !== undefined) {
      void sdkLifecycle.startup().then(() => {
        this._refreshActivePort()
      })
    }
    const subscriptionLifecycle = this._options?.subscriptionLifecycle
    if (subscriptionLifecycle !== undefined) {
      void subscriptionLifecycle.startup().then(() => {
        this._refreshActivePort()
      })
    }
    this._refreshActivePort()
  }

  /**
   * Returns the currently provided `ChatTransportPort`. Test seam for T-ASM-021;
   * production code reads the port via Vue's `inject(CHAT_TRANSPORT_PORT)`.
   */
  public getActiveClaudeCliPort(): ChatTransportPort {
    return this._activeClaudeCliPort.value
  }

  /**
   * Returns the currently provided `TransportKind`. Test seam for T-ASM-075;
   * production code reads the kind via Vue's `inject(TRANSPORT_KIND_KEY)`.
   */
  public getActiveTransportKind(): TransportKind {
    return this._activeTransportKind.value
  }

  /**
   * Recompute the active transport via the injected selector factory. No-op
   * when no factory was provided (legacy direct-port path).
   */
  private _refreshActivePort(): void {
    if (this._options === null) return
    const selection = this._options.selectTransport(this.plugin.settings)
    if (selection.port !== this._activeClaudeCliPort.value) {
      this._activeClaudeCliPort.value = selection.port
    }
    if (selection.kind !== this._activeTransportKind.value) {
      this._activeTransportKind.value = selection.kind
    }
  }

  /**
   * Best-effort read of `useMessagesStore().status` from the Pinia instance owned
   * by this view. Returns `false` if pinia hasn't been initialised yet (i.e.
   * onOpen hasn't run) — in that case there cannot be an in-flight turn.
   */
  private _isChatLoading(): boolean {
    if (this.pinia === null) return false
    const pinia = this.pinia
    // Pinia may be torn down (onClose -> unmount). `trySync` keeps this method
    // raw-try/catch-free per the no-try-catch-outside-infrastructure rule;
    // a thrown error is treated as not-loading so we don't strand the next
    // selector update.
    const result = trySync(() => useMessagesStore(pinia).status === 'loading')
    return result.ok ? result.value : false
  }
}
