import { Plugin, TFolder } from 'obsidian'
import { SpecoratorView, VIEW_TYPE } from './SpecoratorView'
import { SpecoratorSettingTab } from './settings'
import { DEFAULT_SETTINGS, type PluginSettings } from '@/domain/settings/PluginSettings'
import { ObsidianBridge } from '@/infrastructure/obsidian/ObsidianBridge'
import { PluginCore } from '@/core/plugin-core'
import { ALL_MODULES, type ModuleDescriptor } from '@/modules'

/** Keys that belong to the flat PluginSettings namespace. */
const PLUGIN_SETTINGS_KEYS: ReadonlyArray<keyof PluginSettings> = [
  'locale',
  'specsFolder',
  'archiveFolder',
  'decisionsFolder',
  'constitutionFile',
  'gateStrictness',
  'teamMode',
  'logLevel',
]

export default class SpecoratorPlugin extends Plugin {
  settings: PluginSettings = { ...DEFAULT_SETTINGS }
  core: PluginCore | null = null
  bridge: ObsidianBridge | null = null

  /** Full stored data blob: specorator sub-key + per-module sub-keys + _moduleVersions. */
  private _storedData: Record<string, unknown> = {}

  async onload(): Promise<void> {
    await this.loadSettings()

    this.bridge = new ObsidianBridge(
      this.app,
      () => this.settings,
      (s) => this.updateSettings(s),
    )
    this.core = new PluginCore(ALL_MODULES as ReadonlyArray<ModuleDescriptor>, {
      settings: this.bridge,
      vault: this.bridge,
      workspace: this.bridge,
      notifications: this.bridge,
      logger: this.bridge,
    })

    // Pass the full stored blob so PluginCore can migrate per-module settings in-place.
    await this.core.init(this._storedData)

    // Re-sync PluginSettings from the specorator blob after migration/validation may have coerced values.
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...((this._storedData.specorator ?? {}) as Partial<PluginSettings>),
    }

    // Persist any migrations that occurred during init.
    await this.saveData(this._storedData)

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
    this.bridge?.hideAllNotices()
    // onunload() is synchronous (Obsidian contract). destroy() is fire-and-forget;
    // module destroy() implementations must be fast and non-critical.
    void this.core?.destroy()
  }

  async loadSettings(): Promise<void> {
    const stored = (await this.loadData()) as Record<string, unknown> | null
    const raw: Record<string, unknown> = { ...(stored ?? {}) }

    // NFR-AVS-004: treat legacy `featuresFolder` as `specsFolder` if present.
    if (typeof raw.featuresFolder === 'string' && typeof raw.specsFolder !== 'string') {
      raw.specsFolder = raw.featuresFolder
    }

    // Promote legacy flat PluginSettings to the specorator sub-key (W7 storage migration).
    if (!('specorator' in raw)) {
      const specorator: Record<string, unknown> = {}
      for (const key of PLUGIN_SETTINGS_KEYS) {
        if (key in raw) specorator[key] = raw[key]
      }
      const { _moduleVersions } = raw
      this._storedData = {
        ...(_moduleVersions !== undefined ? { _moduleVersions } : {}),
        specorator,
      }
    } else {
      this._storedData = raw
    }

    this.settings = {
      ...DEFAULT_SETTINGS,
      ...((this._storedData.specorator ?? {}) as Partial<PluginSettings>),
    }
  }

  async updateSettings(partial: Partial<PluginSettings>): Promise<void> {
    this.settings = { ...this.settings, ...partial }
    this._storedData = { ...this._storedData, specorator: { ...this.settings } }
    await this.saveData(this._storedData)
    await this.core?.notifySettingsChanged('specorator', this.settings)
  }

  async updateModuleSettings(settingsKey: string, partial: Record<string, unknown>): Promise<void> {
    const current = (this._storedData[settingsKey] ?? {}) as Record<string, unknown>
    const updated = { ...current, ...partial }
    this._storedData = { ...this._storedData, [settingsKey]: updated }
    await this.saveData(this._storedData)
    await this.core?.notifySettingsChanged(settingsKey, updated)
  }

  /**
   * DESIGN-AVS-001: If the vault has a `features/` folder but not a `specs/`
   * folder, show a one-time notice informing the user to rename it.
   */
  private detectLegacyVaultLayout(): void {
    if (!this.bridge) return
    const hasFeaturesFolder = this.app.vault.getAbstractFileByPath('features') instanceof TFolder
    const hasSpecsFolder = this.app.vault.getAbstractFileByPath(this.settings.specsFolder) instanceof TFolder
    if (hasFeaturesFolder && !hasSpecsFolder) {
      this.bridge.showWarning(
        `This vault uses the old \`features/\` folder. ` +
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
