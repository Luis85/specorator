import { ItemView, type WorkspaceLeaf } from 'obsidian'
import { createApp, type App as VueApp } from 'vue'
import { createPinia } from 'pinia'
import { router } from '@/ui/router'
import { i18n, setLocale, type SupportedLocale } from '@/ui/i18n'
import App from '@/ui/App.vue'
import {
  SETTINGS_PORT,
  VAULT_PORT,
  WORKSPACE_PORT,
  NOTIFICATION_PORT,
  LOGGER_PORT,
} from '@/infrastructure/bridge/ports'
import { ObsidianBridge } from '@/infrastructure/obsidian/ObsidianBridge'
import type SpecoratorPlugin from './main'

export const VIEW_TYPE = 'specorator'

export class SpecoratorView extends ItemView {
  private vueApp: VueApp | null = null
  private bridge: ObsidianBridge | null = null
  private _onUnhandledRejection: ((e: PromiseRejectionEvent) => void) | null = null
  private _routerErrorCleanup: (() => void) | null = null

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: SpecoratorPlugin,
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

    const bridge = new ObsidianBridge(
      this.app,
      () => this.plugin.settings,
      (s) => this.plugin.updateSettings(s),
    )
    this.bridge = bridge

    setLocale(this.plugin.settings.locale as SupportedLocale)

    this.vueApp = createApp(App)
    this.vueApp.use(createPinia())
    this.vueApp.use(router)
    this.vueApp.use(i18n)
    this.vueApp.provide(SETTINGS_PORT, bridge)
    this.vueApp.provide(VAULT_PORT, bridge)
    this.vueApp.provide(WORKSPACE_PORT, bridge)
    this.vueApp.provide(NOTIFICATION_PORT, bridge)
    this.vueApp.provide(LOGGER_PORT, bridge)
    this.vueApp.mount(mountPoint)

    this.vueApp.config.errorHandler = (err, _instance, info) => {
      bridge.error(`[Vue] Unhandled error in ${info}`, err)
      bridge.showError('An unexpected error occurred. Check the console for details.')
    }

    this._onUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (!this.bridge) return
      this.bridge.error('[Unhandled rejection]', event.reason)
      this.bridge.showError('An unexpected error occurred. Check the console for details.')
    }
    window.addEventListener('unhandledrejection', this._onUnhandledRejection)

    // router.onError — navigation failures may leave the app on the previous route.
    // Router is a module-level singleton, so each onOpen() must unregister its handler
    // in onClose() to prevent accumulation across panel re-opens.
    this._routerErrorCleanup = router.onError((err) => {
      if (!this.bridge) return
      this.bridge.error('[Router] Navigation error', err)
      this.bridge.showError('Navigation failed. Please try again.')
    })

    return Promise.resolve()
  }

  onClose(): Promise<void> {
    if (this._onUnhandledRejection) {
      window.removeEventListener('unhandledrejection', this._onUnhandledRejection)
      this._onUnhandledRejection = null
    }
    this._routerErrorCleanup?.()
    this._routerErrorCleanup = null
    this.bridge?.hideAllNotices()
    this.vueApp?.unmount()
    this.vueApp = null
    this.bridge = null
    return Promise.resolve()
  }
}
