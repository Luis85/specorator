import type { App } from 'obsidian'
import { PluginSettingTab, Setting } from 'obsidian'
import type { ModuleDescriptor, SettingsFieldDescriptor } from '@/modules/module'
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

    this.renderAboutYouSection()
    this.renderMcpServerStatus()
  }

  private renderAboutYouSection(): void {
    const { containerEl } = this

    new Setting(containerEl).setName('About you').setHeading()

    new Setting(containerEl)
      .setName('Your introduction')
      .setDesc("A few sentences about your role and what you're working on. Used to personalise AI suggestions.")
      .addTextArea((ta) =>
        ta
          .setValue(this.plugin.settings.userPersona)
          .setPlaceholder("For example: I'm a product manager at a scale-up...")
          .onChange(async (value) => {
            await this.plugin.updateSettings({ userPersona: value })
          }),
      )

    if (!this.plugin.settings.userPersona) {
      containerEl.createEl('p', {
        text: 'Add a short introduction so Specorator can tailor its suggestions to you.',
        cls: 'setting-item-description',
      })
    }

    new Setting(containerEl)
      .setName('Set up Specorator again')
      .setDesc('Start the setup wizard again to update your workspace or introduction.')
      .addButton((btn) =>
        btn.setButtonText('Re-run setup').onClick(async () => {
          await this.plugin.updateSettings({ onboardingComplete: false })
        }),
      )
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

  private async saveField(mod: ModuleDescriptor, key: string, value: unknown): Promise<void> {
    if (mod.settingsKey === 'specorator') {
      await this.plugin.updateSettings({ [key]: value })
    } else if (mod.settingsKey !== undefined) {
      await this.plugin.updateModuleSettings(mod.settingsKey, { [key]: value })
    }
  }
}
