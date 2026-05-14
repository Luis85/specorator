import type { App } from 'obsidian'
import { PluginSettingTab, Setting } from 'obsidian'
import type { ModuleDescriptor, SettingsFieldDescriptor } from '@/modules/module'
import { VIEW_TYPE, SpecoratorView } from './SpecoratorView'
import type SpecoratorPlugin from './main'

export class SpecoratorSettingTab extends PluginSettingTab {
  private readonly plugin: SpecoratorPlugin

  constructor(app: App, plugin: SpecoratorPlugin) {
    super(app, plugin)
    this.plugin = plugin
  }

  display(): void {
    const { containerEl } = this
    containerEl.empty()

    for (const mod of this.plugin.core?.allModules ?? []) {
      const fields = mod.settingsSchema?.fields
      if (fields === undefined || fields.length === 0) continue

      new Setting(containerEl).setName(mod.id).setHeading()

      for (const field of fields) {
        const currentValue = this.currentValue(mod, field)
        const setting = new Setting(containerEl).setName(field.label)
        if (field.description !== undefined) setting.setDesc(field.description)
        this.addControl(setting, mod, field, currentValue)
      }
    }

    this.renderMcpServerStatus()
    this.renderAnthropicKeyField()
  }

  /**
   * Static status indicator for the local MCP server. Reflects the state at
   * the moment the settings tab is rendered — re-open settings to refresh.
   * Lives below the module-driven settings so the user sees it after the
   * "Enable MCP server (advanced)" toggle.
   */
  private renderMcpServerStatus(): void {
    const running = this.plugin.core?.isMcpServerRunning() === true
    new Setting(this.containerEl)
      .setName('MCP server status')
      .setDesc(
        running
          ? 'Running. Use the "Stop MCP server" command or toggle the setting above to stop it.'
          : 'Stopped. Toggle "Enable MCP server (advanced)" above, or run the "Start MCP server" command.',
      )
  }

  private currentValue(mod: ModuleDescriptor, field: SettingsFieldDescriptor): unknown {
    if (mod.settingsKey === 'specorator') {
      return (this.plugin.settings as unknown as Record<string, unknown>)[field.key] ?? field.default
    }
    if (mod.settingsKey !== undefined) {
      const slice = (this.plugin.core?.getModuleSettings(mod.settingsKey) ?? {}) as Record<string, unknown>
      return slice[field.key] ?? field.default
    }
    return field.default
  }

  private addControl(
    setting: Setting,
    mod: ModuleDescriptor,
    field: SettingsFieldDescriptor,
    currentValue: unknown,
  ): void {
    switch (field.type) {
      case 'toggle':
        setting.addToggle((t) =>
          t.setValue(currentValue as boolean).onChange(async (value) => {
            await this.saveField(mod, field.key, value)
          }),
        )
        break

      case 'text':
        setting.addText((t) =>
          t
            .setValue(String(currentValue ?? field.default))
            .onChange(async (value) => {
              await this.saveField(mod, field.key, value.trim() || String(field.default))
            }),
        )
        break

      case 'number':
        setting.addText((t) =>
          t
            .setValue(String(currentValue ?? field.default))
            .onChange(async (value) => {
              const n = Number(value)
              await this.saveField(mod, field.key, Number.isNaN(n) ? field.default : n)
            }),
        )
        break

      case 'dropdown': {
        setting.addDropdown((dd) => {
          for (const opt of field.options ?? []) {
            dd.addOption(opt.value, opt.label)
          }
          dd.setValue(String(currentValue ?? field.default)).onChange(async (value) => {
            await this.saveField(mod, field.key, value)
          })
        })
        break
      }
    }
  }

  /**
   * Renders the Anthropic API key password field outside the module-driven settings loop.
   * Satisfies REQ-CCS-001, NFR-CCS-006, SPEC-CCS-001 §8.3.
   *
   * The key is stored in the plugin data blob (not in any vault file).
   * `inputEl.type = 'password'` masks the value (NFR-CCS-006).
   * `autocomplete = 'off'` prevents browser/OS autofill.
   * onChange handler trims whitespace before saving.
   */
  private renderAnthropicKeyField(): void {
    new Setting(this.containerEl)
      .setName('Anthropic key')
      .setDesc(
        "Required to use the AI assistant. Stored in this device's plugin settings. " +
          'If you use Obsidian Sync, your key will be included in the sync — use a key scoped to your personal devices.',
      )
      .addText((text) => {
        text.inputEl.type = 'password'
        text.inputEl.autocomplete = 'off'
        text.inputEl.setAttribute('data-testid', 'settings-anthropic-key')
        text
          // eslint-disable-next-line obsidianmd/ui/sentence-case
          .setPlaceholder('sk-ant-…')
          .setValue(this.plugin.settings.anthropicApiKey)
          .onChange(async (value) => {
            await this.plugin.updateSettings({ anthropicApiKey: value.trim() })
            // T-CCS-037: signal ChatSidebar to re-check adapter availability.
            this._bumpAllViews()
          })
      })
  }

  /**
   * Calls bumpSettingsVersion() on every open SpecoratorView leaf so that
   * ChatSidebar re-checks adapter availability after the API key changes.
   * Satisfies T-CCS-037, D-CCS-003.
   */
  private _bumpAllViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      if (leaf.view instanceof SpecoratorView) {
        leaf.view.bumpSettingsVersion()
      }
    }
  }

  private async saveField(mod: ModuleDescriptor, key: string, value: unknown): Promise<void> {
    if (mod.settingsKey === 'specorator') {
      await this.plugin.updateSettings({ [key]: value })
    } else if (mod.settingsKey !== undefined) {
      await this.plugin.updateModuleSettings(mod.settingsKey, { [key]: value })
    }
  }
}
