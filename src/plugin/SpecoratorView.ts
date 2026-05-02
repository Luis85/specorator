import { ItemView, type WorkspaceLeaf } from 'obsidian'
import { createApp, type App as VueApp } from 'vue'
import { createPinia } from 'pinia'
import { router } from '@/ui/router'
import { i18n, setLocale, type SupportedLocale } from '@/ui/i18n'
import App from '@/ui/App.vue'
import { BRIDGE_KEY } from '@/infrastructure/bridge/BridgeKey'
import { ObsidianBridge } from '@/infrastructure/obsidian/ObsidianBridge'
import type SpecoratorPlugin from './main'

export const VIEW_TYPE = 'specorator'

export class SpecoratorView extends ItemView {
  private vueApp: VueApp | null = null

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: SpecoratorPlugin,
  ) {
    super(leaf)
  }

  getViewType(): string { return VIEW_TYPE }
  getDisplayText(): string { return 'Specorator' }
  getIcon(): string { return 'layout-dashboard' }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement
    container.empty()

    const mountPoint = container.createEl('div', {
      cls: 'specorator-root',
      attr: { id: 'specorator-root', style: 'height:100%;overflow:auto;' },
    })

    const bridge = new ObsidianBridge(
      this.app,
      this.plugin.settings,
      (s) => this.plugin.updateSettings(s),
    )

    setLocale(this.plugin.settings.locale as SupportedLocale)

    this.vueApp = createApp(App)
    this.vueApp.use(createPinia())
    this.vueApp.use(router)
    this.vueApp.use(i18n)
    this.vueApp.provide(BRIDGE_KEY, bridge)
    this.vueApp.mount(mountPoint)
  }

  async onClose(): Promise<void> {
    this.vueApp?.unmount()
    this.vueApp = null
  }
}
