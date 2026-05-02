import { Notice, Plugin, TFolder } from 'obsidian'
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

    this.detectLegacyVaultLayout()
  }

  async onunload(): Promise<void> {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE)
  }

  async loadSettings(): Promise<void> {
    const stored = await this.loadData()
    // NFR-AVS-004: treat legacy `featuresFolder` as `specsFolder` if present
    const raw = (stored ?? {}) as Record<string, unknown>
    if (raw.featuresFolder && !raw.specsFolder) {
      raw.specsFolder = raw.featuresFolder
    }
    this.settings = { ...DEFAULT_SETTINGS, ...(raw as Partial<PluginSettings>) }
  }

  async updateSettings(partial: Partial<PluginSettings>): Promise<void> {
    this.settings = { ...this.settings, ...partial }
    await this.saveData(this.settings)
  }

  /**
   * DESIGN-AVS-001: If the vault has a `features/` folder but not a `specs/`
   * folder, show a one-time notice informing the user to rename it.
   */
  private detectLegacyVaultLayout(): void {
    const hasFeaturesFolder = this.app.vault.getAbstractFileByPath('features') instanceof TFolder
    const hasSpecsFolder = this.app.vault.getAbstractFileByPath(this.settings.specsFolder) instanceof TFolder
    if (hasFeaturesFolder && !hasSpecsFolder) {
      new Notice(
        `Specorator: this vault uses the old \`features/\` folder. ` +
          `Please rename it to \`${this.settings.specsFolder}/\` or update the Specs folder setting.`,
        8000,
      )
    }
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
