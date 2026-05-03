import { App, PluginSettingTab, Setting } from 'obsidian'
import { type PluginSettings, DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'
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
    containerEl.createEl('h2', { text: 'Specorator' })

    new Setting(containerEl)
      .setName('Language')
      .setDesc('Display language for the Specorator panel.')
      .addDropdown((dd) =>
        dd
          .addOption('en', 'English')
          .addOption('de', 'Deutsch')
          .setValue(this.plugin.settings.locale)
          .onChange(async (value) => {
            await this.plugin.updateSettings({ locale: value })
          }),
      )

    new Setting(containerEl)
      .setName('Specs folder')
      .setDesc('Vault folder where spec directories are created (agentic-workflow convention: specs).')
      .addText((text) =>
        text
          .setValue(this.plugin.settings.specsFolder)
          .onChange(async (value) => {
            await this.plugin.updateSettings({ specsFolder: value.trim() || DEFAULT_SETTINGS.specsFolder })
          }),
      )

    new Setting(containerEl)
      .setName('Archive folder')
      .setDesc('Vault folder for archived features.')
      .addText((text) =>
        text
          .setValue(this.plugin.settings.archiveFolder)
          .onChange(async (value) => {
            await this.plugin.updateSettings({ archiveFolder: value.trim() || DEFAULT_SETTINGS.archiveFolder })
          }),
      )

    new Setting(containerEl)
      .setName('Decisions folder')
      .setDesc('Vault folder for architecture decision records.')
      .addText((text) =>
        text
          .setValue(this.plugin.settings.decisionsFolder)
          .onChange(async (value) => {
            await this.plugin.updateSettings({ decisionsFolder: value.trim() || DEFAULT_SETTINGS.decisionsFolder })
          }),
      )

    new Setting(containerEl)
      .setName('Constitution file')
      .setDesc('Vault path to the project constitution markdown file.')
      .addText((text) =>
        text
          .setValue(this.plugin.settings.constitutionFile)
          .onChange(async (value) => {
            await this.plugin.updateSettings({ constitutionFile: value.trim() || DEFAULT_SETTINGS.constitutionFile })
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
