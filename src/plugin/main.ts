import { Plugin } from 'obsidian'
import { SpecoratorView, VIEW_TYPE } from './SpecoratorView'
import { SpecoratorSettingTab, DEFAULT_SETTINGS, type PluginSettings } from './settings'

export default class SpecoratorPlugin extends Plugin {
  settings: PluginSettings = { ...DEFAULT_SETTINGS }

  async onload(): Promise<void> {
    await this.loadSettings()

    this.registerView(VIEW_TYPE, (leaf) => new SpecoratorView(leaf, this))

    this.addRibbonIcon('layout-dashboard', 'Open Specorator', () => {
      void this.activateView()
    })

    this.addCommand({
      id: 'open-specorator',
      name: 'Open Specorator panel',
      callback: () => void this.activateView(),
    })

    this.addSettingTab(new SpecoratorSettingTab(this.app, this))
  }

  async onunload(): Promise<void> {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE)
  }

  async loadSettings(): Promise<void> {
    const stored = await this.loadData()
    this.settings = { ...DEFAULT_SETTINGS, ...(stored as Partial<PluginSettings>) }
  }

  async updateSettings(partial: Partial<PluginSettings>): Promise<void> {
    this.settings = { ...this.settings, ...partial }
    await this.saveData(this.settings)
  }

  private async activateView(): Promise<void> {
    const { workspace } = this.app

    const existing = workspace.getLeavesOfType(VIEW_TYPE)
    if (existing.length > 0) {
      workspace.revealLeaf(existing[0])
      return
    }

    const leaf = workspace.getRightLeaf(false)
    if (!leaf) return
    await leaf.setViewState({ type: VIEW_TYPE, active: true })
    workspace.revealLeaf(leaf)
  }
}
