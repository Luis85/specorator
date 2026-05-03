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
      id: 'open-panel',
      name: 'Open panel',
      callback: () => void this.activateView(),
    })

    this.addSettingTab(new SpecoratorSettingTab(this.app, this))

    this.detectLegacyVaultLayout()
  }

  override onunload(): void {
    // No teardown required: leaves are auto-detached by Obsidian.
  }

  async loadSettings(): Promise<void> {
    const stored = (await this.loadData()) as Record<string, unknown> | null
    // NFR-AVS-004: treat legacy `featuresFolder` as `specsFolder` if present
    const raw: Record<string, unknown> = { ...(stored ?? {}) }
    if (typeof raw.featuresFolder === 'string' && typeof raw.specsFolder !== 'string') {
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
      void workspace.revealLeaf(existing[0])
      return
    }

    const leaf = workspace.getRightLeaf(false)
    if (leaf === null) return
    await leaf.setViewState({ type: VIEW_TYPE, active: true })
    void workspace.revealLeaf(leaf)
  }
}
