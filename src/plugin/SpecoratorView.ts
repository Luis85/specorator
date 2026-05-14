import { ItemView, Platform, type WorkspaceLeaf } from 'obsidian'
import { createApp, ref, type App as VueApp } from 'vue'
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
import type SpecoratorPlugin from './main'

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
  public pinia!: Pinia

  /**
   * Reactive counter. Incremented by bumpSettingsVersion() each time the
   * Anthropic API key is saved in Settings. ChatSidebar watches this to
   * re-check adapter availability. Satisfies D-CCS-003, T-CCS-037.
   */
  private readonly _settingsVersion = ref(0)

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: SpecoratorPlugin,
    private readonly claudeCliPort: ClaudeCliPort,
  ) {
    super(leaf)
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
    this.vueApp.provide(CLAUDE_CLI_PORT, this.claudeCliPort)
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
   * Satisfies D-CCS-003, T-CCS-037.
   */
  public bumpSettingsVersion(): void {
    this._settingsVersion.value++
  }
}
