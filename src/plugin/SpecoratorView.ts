import { ItemView, Platform, type WorkspaceLeaf } from 'obsidian'
import { createApp, ref, type App as VueApp, type Ref } from 'vue'
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
  CLAUDE_CLI_PORT,
  COMMUNITY_PLUGIN_PORT,
  IS_MOBILE_KEY,
  SETTINGS_VERSION_KEY,
} from '@/infrastructure/bridge/ports'
import { FeatureRepository } from '@/infrastructure/bridge/FeatureRepository'
import { FeatureService } from '@/application/feature/FeatureService'
import { FEATURE_SERVICE_KEY } from '@/ui/composables/useFeatureService'
import type { ClaudeCliPort } from '@/domain/ports'
import type { PluginSettings } from '@/domain/settings/PluginSettings'
import type { TransportSelection } from '@/plugin/transport/TransportSelector'
import { useChatStore } from '@/ui/stores/chatStore'
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
  readonly subscriptionAdapter: ClaudeCliPort
  readonly selectTransport: SelectTransportFactory
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
   * Reactive holder for the active `ClaudeCliPort`. Mutated by
   * `_refreshActivePort()` whenever settings change (gated by REQ-ASM-003 —
   * skipped while a chat turn is in flight). Provided to Vue under
   * `CLAUDE_CLI_PORT` so UI consumers stay transport-agnostic.
   *
   * Satisfies REQ-ASM-001, REQ-ASM-002, REQ-ASM-003.
   */
  private readonly _activeClaudeCliPort: Ref<ClaudeCliPort>

  /**
   * Optional subscription-transport adapter + selector closure passed by the
   * plugin (SPEC-ASM-001 §9.1). When absent, the view falls back to the legacy
   * direct-port path for backwards compatibility with existing tests.
   */
  private readonly _options: SpecoratorViewOptions | null

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: SpecoratorPlugin,
    private readonly claudeCliPort: ClaudeCliPort,
    options?: SpecoratorViewOptions,
  ) {
    super(leaf)
    this._options = options ?? null
    // Seed the reactive port: when a selector is provided, derive from
    // settings; otherwise fall back to the directly-injected SDK adapter.
    const initial = this._options !== null
      ? this._options.selectTransport(this.plugin.settings).port
      : this.claudeCliPort
    this._activeClaudeCliPort = ref(initial)
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
    // `ClaudeCliPort` and need no changes (SPEC §9.5).
    const ref = this._activeClaudeCliPort
    const reactivePort = new Proxy({} as ClaudeCliPort, {
      get(_target, prop): unknown {
        const current = ref.value as unknown as Record<PropertyKey, unknown>
        const value = current[prop]
        return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(current) : value
      },
    })
    this.vueApp.provide(CLAUDE_CLI_PORT, reactivePort)
    this.vueApp.provide(COMMUNITY_PLUGIN_PORT, bridge)
    this.vueApp.provide(IS_MOBILE_KEY, Platform.isMobile)
    this.vueApp.provide(SETTINGS_VERSION_KEY, this._settingsVersion)
    this.vueApp.provide(
      FEATURE_SERVICE_KEY,
      new FeatureService(new FeatureRepository(bridge, bridge, bridge)),
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
    this.plugin.bridge?.hideAllNotices()
    this.vueApp?.unmount()
    this.vueApp = null
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
      // REQ-ASM-003 — skip transport switch while a turn is in flight. The
      // next `bumpSettingsVersion()` (or the user's next message) will pick
      // up the new transport on the following call.
      return
    }
    this._refreshActivePort()
  }

  /**
   * Returns the currently provided `ClaudeCliPort`. Test seam for T-ASM-021;
   * production code reads the port via Vue's `inject(CLAUDE_CLI_PORT)`.
   */
  public getActiveClaudeCliPort(): ClaudeCliPort {
    return this._activeClaudeCliPort.value
  }

  /**
   * Recompute the active transport via the injected selector factory. No-op
   * when no factory was provided (legacy direct-port path).
   */
  private _refreshActivePort(): void {
    if (this._options === null) return
    const next = this._options.selectTransport(this.plugin.settings).port
    if (next !== this._activeClaudeCliPort.value) {
      this._activeClaudeCliPort.value = next
    }
  }

  /**
   * Best-effort read of `useChatStore().status` from the Pinia instance owned
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
    const result = trySync(() => useChatStore(pinia).status === 'loading')
    return result.ok ? result.value : false
  }
}
