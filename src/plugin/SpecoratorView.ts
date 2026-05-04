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
} from '@/infrastructure/bridge/ports'
import { ObsidianBridge } from '@/infrastructure/obsidian/ObsidianBridge'
import { createEventBus } from '@/domain/shared/event-bus'
import { tryAsync } from '@/domain/shared/tryAsync'
import { bootstrapModules, type BootstrappedModules } from '@/core/bootstrap'
import { ALL_MODULES, type ModulePorts } from '@/modules'
import type SpecoratorPlugin from './main'

export const VIEW_TYPE = 'specorator'

export class SpecoratorView extends ItemView {
  private vueApp: VueApp | null = null
  private readonly appBus = createEventBus()
  private bootstrapped: BootstrappedModules | null = null

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: SpecoratorPlugin,
  ) {
    super(leaf)
  }

  getViewType(): string {
    return VIEW_TYPE
  }
  getDisplayText(): string {
    return 'Specorator'
  }
  getIcon(): string {
    return 'layout-dashboard'
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement
    container.empty()

    const mountPoint = container.createDiv({
      cls: 'specorator-root',
      attr: { id: 'specorator-root', style: 'height:100%;overflow:auto;' },
    })

    const bridge = new ObsidianBridge(
      this.app,
      this.plugin.settings,
      (s) => this.plugin.updateSettings(s),
    )

    setLocale(this.plugin.settings.locale as SupportedLocale)

    const ports: ModulePorts = {
      settings: bridge,
      vault: bridge,
      workspace: bridge,
      notifications: bridge,
      bus: this.appBus,
    }
    this.bootstrapped = await bootstrapModules(
      ALL_MODULES,
      ports,
      this.plugin.settings as unknown as Readonly<Record<string, unknown>>,
    )

    this.vueApp = createApp(App)
    this.vueApp.use(createPinia())
    this.vueApp.use(router)
    this.vueApp.use(i18n)
    this.vueApp.provide(SETTINGS_PORT, bridge)
    this.vueApp.provide(VAULT_PORT, bridge)
    this.vueApp.provide(WORKSPACE_PORT, bridge)
    this.vueApp.provide(NOTIFICATION_PORT, bridge)
    this.vueApp.mount(mountPoint)
  }

  async onClose(): Promise<void> {
    const teardownResult = this.bootstrapped !== null
      ? await tryAsync(async () => {
          await this.bootstrapped!.teardown()
          this.bootstrapped = null
        })
      : null
    this.vueApp?.unmount()
    this.vueApp = null
    if (teardownResult !== null && !teardownResult.ok) {
      throw teardownResult.error
    }
  }
}
