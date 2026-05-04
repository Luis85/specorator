import { Notice, Plugin, TFolder } from 'obsidian'
import { SpecoratorView, VIEW_TYPE } from './SpecoratorView'
import { SpecoratorSettingTab } from './settings'
import { DEFAULT_SETTINGS, type PluginSettings } from '@/domain/settings/PluginSettings'
import { ObsidianBridge } from '@/infrastructure/obsidian/ObsidianBridge'
import { PluginCore } from '@/core/plugin-core'
import { ALL_MODULES } from '@/modules'

export default class SpecoratorPlugin extends Plugin {
  settings: PluginSettings = { ...DEFAULT_SETTINGS }
  core: PluginCore | null = null
  bridge: ObsidianBridge | null = null

  async onload(): Promise<void> {
    await this.loadSettings()

    this.bridge = new ObsidianBridge(
      this.app,
      () => this.settings,
      (s) => this.updateSettings(s),
    )
    this.core = new PluginCore(ALL_MODULES, {
      settings: this.bridge,
      vault: this.bridge,
      workspace: this.bridge,
      notifications: this.bridge,
      logger: this.bridge,
    })
    // Pass already-normalized settings (loadSettings() already called loadData() and merged).
    // Passing raw loadData() would bypass the featuresFolder→specsFolder migration in loadSettings().
    await this.core.init(this.settings as unknown as Record<string, unknown>)

    this.registerView(VIEW_TYPE, (leaf) => new SpecoratorView(leaf, this))

    this.addRibbonIcon('layout-dashboard', 'Open Specorator', () => {
      void this.activateView()
    })

    this.addCommand({
      // Keep the original command id so existing hotkeys and automations survive upgrades.
      // eslint-disable-next-line obsidianmd/commands/no-plugin-id-in-command-id
      id: 'open-specorator',
      name: 'Open panel',
      callback: () => void this.activateView(),
    })

    this.addSettingTab(new SpecoratorSettingTab(this.app, this))
    this.detectLegacyVaultLayout()
  }

  // eslint-disable-next-line obsidianmd/detach-leaves
  override onunload(): void {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE)
    // onunload() is synchronous (Obsidian contract). destroy() is fire-and-forget;
    // module destroy() implementations must be fast and non-critical.
    void this.core?.destroy()
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
