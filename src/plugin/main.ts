import { Plugin, TFolder } from 'obsidian'
import { SpecoratorView, VIEW_TYPE } from './SpecoratorView'
import { SpecoratorSettingTab } from './settings'
import { promoteLegacyFlatSettings } from './loadSettings-migrate'
import { ensureLeafLoaded } from './leafLoader'
import { DEFAULT_SETTINGS, type PluginSettings } from '@/domain/settings/PluginSettings'
import { ObsidianBridge } from '@/infrastructure/obsidian/ObsidianBridge'
import { ObsidianMcpServerAdapter } from '@/infrastructure/obsidian/ObsidianMcpServerAdapter'
import { ObsidianMetadataCacheAdapter } from '@/infrastructure/obsidian/ObsidianMetadataCacheAdapter'
import { ObsidianCanvasAdapter } from '@/infrastructure/obsidian/ObsidianCanvasAdapter'
import { FeatureRepository } from '@/infrastructure/bridge/FeatureRepository'
import { PluginCore } from '@/core/plugin-core'
import { ALL_MODULES, type ModuleDescriptor } from '@/modules'
import { i18nMerge, i18nTranslate, setLocale, type SupportedLocale } from '@/ui/i18n'
import type { TranslationPort } from '@/domain/ports'

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
    const translationPort: TranslationPort = { t: i18nTranslate }
    this.core = new PluginCore(ALL_MODULES as ReadonlyArray<ModuleDescriptor>, {
      settings: this.bridge,
      vault: this.bridge,
      workspace: this.bridge,
      notifications: this.bridge,
      logger: this.bridge,
      t: translationPort,
      i18nMerge,
      mcpServer: new ObsidianMcpServerAdapter(
        this.bridge,
        new FeatureRepository(this.bridge, this.bridge, this.bridge),
        () => this.settings.specsFolder,
        new ObsidianMetadataCacheAdapter(this.app),
        new ObsidianCanvasAdapter(this.bridge),
      ),
      isMcpServerEnabled: () => this.settings.mcpServerEnabled,
    })

    setLocale(this.settings.locale as SupportedLocale)
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

    this.addCommand({
      id: 'start-mcp-server',
      name: 'Start MCP server',
      callback: () => void this.updateSettings({ mcpServerEnabled: true }),
    })

    this.addCommand({
      id: 'stop-mcp-server',
      name: 'Stop MCP server',
      callback: () => void this.updateSettings({ mcpServerEnabled: false }),
    })

    this.addCommand({
      id: 're-run-setup',
      name: 'Re-run setup',
      callback: () => {
        void this.updateSettings({ onboardingComplete: false }).then(() => this.activateView())
      },
    })

    this.addSettingTab(new SpecoratorSettingTab(this.app, this))

    this.registerObsidianProtocolHandler('specorator', (params) => {
      const searchParams = new URLSearchParams(Object.entries(params))
      if (this.core?.handleUri(searchParams) === true) return

      // v1 stub handlers — replaced by module uriActions when the owning module is built
      const action = params.action
      if (action === 'open-chat' || action === 'focus-chat') {
        void this.activateView()
        return
      }
      if (action === 'send-message' || action === 'open-workflow') {
        this.bridge?.showInfo(`URI action "${action}" is not yet implemented.`)
        return
      }
      this.bridge?.showWarning(`Unknown Specorator URI action: "${action}"`)
    })

    // Workspace/vault index isn't guaranteed ready during onload(). Defer any
    // logic that reads workspace layout or vault state until layout is ready.
    this.app.workspace.onLayoutReady(() => {
      this.detectLegacyVaultLayout()
      if (!this.settings.onboardingComplete) {
        void this.activateView()
      }
    })
  }

  // Obsidian's lifecycle guarantees a single onunload() call when the plugin
  // is disabled or the app exits, so detaching our own leaves here is the
  // expected cleanup path despite the obsidianmd/detach-leaves rule's caution.
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

    this._storedData = promoteLegacyFlatSettings(raw)

    this.settings = {
      ...DEFAULT_SETTINGS,
      ...((this._storedData.specorator ?? {}) as Partial<PluginSettings>),
    }
  }

  async updateSettings(partial: Partial<PluginSettings>): Promise<void> {
    const merged = { ...this.settings, ...partial }
    this.settings = merged
    await this.core?.notifySettingsChanged('specorator', merged)
    const validated = (this.core?.getModuleSettings('specorator') ?? merged) as PluginSettings
    this.settings = validated
    this._storedData = { ...this._storedData, specorator: { ...validated } }
    await this.saveData(this._storedData)
  }

  async updateModuleSettings(settingsKey: string, partial: Record<string, unknown>): Promise<void> {
    const current = (this._storedData[settingsKey] ?? {}) as Record<string, unknown>
    const merged = { ...current, ...partial }
    // Notify first so validateSettings runs; persist the (possibly coerced) validated value.
    await this.core?.notifySettingsChanged(settingsKey, merged)
    const validated = (this.core?.getModuleSettings(settingsKey) ?? merged) as Record<string, unknown>
    this._storedData = { ...this._storedData, [settingsKey]: validated }
    await this.saveData(this._storedData)
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
      await ensureLeafLoaded(existing[0])
      void workspace.revealLeaf(existing[0])
      return
    }

    const leaf = workspace.getRightLeaf(false)
    if (leaf === null) return
    await leaf.setViewState({ type: VIEW_TYPE, active: true })
    void workspace.revealLeaf(leaf)
  }
}
