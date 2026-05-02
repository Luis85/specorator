import { App, PluginSettingTab, Setting } from 'obsidian'
import type { PluginSettings } from '@/infrastructure/bridge/IBridge'
import { DEFAULT_SETTINGS } from '@/infrastructure/bridge/IBridge'
import type SpecoratorPlugin from './main'

export type { PluginSettings }
export { DEFAULT_SETTINGS }

export class SpecoratorSettingTab extends PluginSettingTab {
  private readonly plugin: SpecoratorPlugin

  constructor(app: App, plugin: SpecoratorPlugin) {
    super(app, plugin)
    this.plugin = plugin
  }

  display(): void {
    const { containerEl } = this
    containerEl.empty()
    containerEl.createEl('h2', { text: 'Specorator' })

    new Setting(containerEl)
      .setName('Features folder')
      .setDesc('Vault folder where feature directories are created.')
      .addText((text) =>
        text
          .setValue(this.plugin.settings.featuresFolder)
          .onChange(async (value) => {
            await this.plugin.updateSettings({ featuresFolder: value.trim() || 'features' })
          }),
      )

    new Setting(containerEl)
      .setName('Archive folder')
      .setDesc('Vault folder for archived features.')
      .addText((text) =>
        text
          .setValue(this.plugin.settings.archiveFolder)
          .onChange(async (value) => {
            await this.plugin.updateSettings({ archiveFolder: value.trim() || 'archive' })
          }),
      )

    new Setting(containerEl)
      .setName('Gate strictness')
      .setDesc('Strict: blocks advancement when required artifacts are missing. Lenient: warns only.')
      .addDropdown((dd) =>
        dd
          .addOption('strict', 'Strict')
          .addOption('lenient', 'Lenient')
          .setValue(this.plugin.settings.gateStrictness)
          .onChange(async (value) => {
            await this.plugin.updateSettings({
              gateStrictness: value as PluginSettings['gateStrictness'],
            })
          }),
      )

    new Setting(containerEl)
      .setName('Team mode')
      .setDesc('Enable peer sign-off and multi-author attribution.')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.teamMode).onChange(async (value) => {
          await this.plugin.updateSettings({ teamMode: value })
        }),
      )
  }
}
