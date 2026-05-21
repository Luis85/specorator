import type { App } from 'obsidian'
import { PluginSettingTab, Setting } from 'obsidian'
import * as path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { ClaudeBinaryResolver, type ResolverPlatform } from '@/infrastructure/obsidian/ClaudeBinaryResolver'
import { tryAsync, trySync } from '@/domain/shared/tryAsync'
import { SECRET_ID_ANTHROPIC } from '@/domain/ports'
import type { ModuleDescriptor, SettingsFieldDescriptor } from '@/modules/module'
import { VIEW_TYPE, SpecoratorView } from './SpecoratorView'
import { VIEW_TYPE_AGENT, AgentSidepanelView } from './AgentSidepanelView'
import { renderCursorSettingsSection } from './settings/CursorSettingsSection'
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
    this.renderAnthropicKeyField()
    this.renderClaudeCliPathField(containerEl)
    renderCursorSettingsSection({
      containerEl,
      secretStore: this.plugin.secretStore,
      settings: this.plugin.settings,
      cursorKeyCache: this.plugin.getCursorKeyCache(),
      updateSettings: async (patch) => {
        await this.plugin.updateSettings(patch)
      },
      refreshCursorKeyCache: async () => {
        await this.plugin.refreshCursorKeyCache()
      },
      bumpAllViews: () => {
        this._bumpAllViews()
      },
    })
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
          await this.plugin.activateView()
          this.plugin._dispatchNavigate('/onboarding')
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

  /**
   * Renders the Anthropic API key password field outside the module-driven settings loop.
   * Satisfies REQ-CCS-001, NFR-CCS-006, SPEC-CCS-001 §8.3.
   *
   * The key is stored in Obsidian's `App.secretStorage` (desktop ≥1.11.4) via
   * `SecretStorePort`, NOT in the synced `PluginSettings` blob — the latter is
   * mirrored by Obsidian Sync and would leak the key across devices.
   * `inputEl.type = 'password'` masks the value (NFR-CCS-006).
   * `autocomplete = 'off'` prevents browser/OS autofill.
   * onChange handler trims whitespace before saving.
   */
  private renderAnthropicKeyField(): void {
    const secretStore = this.plugin.secretStore
    const writable = secretStore?.available ?? false
    const desc = writable
      ? "Required to use the AI assistant. Stored in this device's OS keychain (not synced)."
      : "Required to use the AI assistant. This Obsidian build does not expose the OS keychain, so the field is read-only here."

    new Setting(this.containerEl)
      .setName('Anthropic key')
      .setDesc(desc)
      .addText((text) => {
        text.inputEl.type = 'password'
        text.inputEl.autocomplete = 'off'
        text.inputEl.setAttribute('data-testid', 'settings-anthropic-key')
        if (!writable) {
          text.inputEl.disabled = true
        }
        text
          // eslint-disable-next-line obsidianmd/ui/sentence-case
          .setPlaceholder('sk-ant-…')
          .setValue(this.plugin.getApiKeyCache())
          .onChange(async (value) => {
            const store = secretStore
            if (store === null) return
            if (!store.available) return
            // Codex P2: persisting via the OS keychain can fail (locked
            // keychain, OS denial). Surface as a no-op rather than throwing
            // out of the onChange handler — the input keeps the user's
            // typed value but `_apiKeyCache` is unchanged on error.
            const outcome = await tryAsync(() =>
              store.setSecret(SECRET_ID_ANTHROPIC, value.trim()),
            )
            if (!outcome.ok) return
            await this.plugin.refreshApiKeyCache()
          })
      })
  }

  /**
   * Renders the "Claude CLI path" Settings field per SPEC-ASM-001 §10.2.
   *
   * Satisfies REQ-ASM-004 (field present), REQ-ASM-005 (autodetect surface),
   * REQ-ASM-008 (verbatim ToS disclosure copy below the input).
   *
   *   - Text input: data-testid `settings-claude-cli-path-input`, trimmed on
   *     change, persisted via `plugin.updateSettings({ claudeCliPath })`,
   *     bumps every open SpecoratorView leaf so the transport selector re-runs.
   *   - Autodetect button: delegates to `ClaudeBinaryResolver.resolve()`
   *     (REQ-ASM-004, REQ-ASM-005). Writes success / failure copy to the
   *     inline status node.
   *   - Test button: spawns `<path> --version` via `spawnSync` with a 5-second
   *     timeout. This is the ONLY allowed `spawnSync` site in the plugin
   *     (spec §10.2 explicitly allow-lists it for this user-driven handler;
   *     it is never reached on chat hot paths) (T-ASM-018 DoD).
   *   - Description: literal REQ-ASM-008 disclosure copy. The user's home
   *     Claude directory and its credentials file are never referenced from
   *     this file (NFR-ASM-004).
   */
  private renderClaudeCliPathField(containerEl: HTMLElement): void {
    let statusEl: HTMLElement | null = null
    let textInput: HTMLInputElement | null = null

    new Setting(containerEl)
      .setName('Claude CLI path')
      .setDesc('Absolute path to the `claude` command-line tool installed on this device.')
      .addText((text) => {
        text.inputEl.setAttribute('data-testid', 'settings-claude-cli-path-input')
        textInput = text.inputEl
        text.setPlaceholder('/usr/local/bin/claude')
        text.setValue(this.plugin.settings.claudeCliPath)
        text.onChange(async (raw) => {
          const trimmed = raw.trim()
          if (trimmed !== this.plugin.settings.claudeCliPath) {
            await this.plugin.updateSettings({ claudeCliPath: trimmed })
            this._bumpAllViews()
          }
        })
      })
      .addExtraButton((b) => {
        b.extraSettingsEl.setAttribute('data-testid', 'settings-claude-cli-path-autodetect')
        b.setIcon('search')
        b.setTooltip('Autodetect claude CLI path')
        b.onClick(() => {
          void this.handleAutodetect(textInput, statusEl)
        })
      })
      .addExtraButton((b) => {
        b.extraSettingsEl.setAttribute('data-testid', 'settings-claude-cli-path-test')
        b.setIcon('check')
        b.setTooltip('Test claude CLI path')
        b.onClick(() => {
          this.handleTestBinary(statusEl)
        })
      })

    const desc = containerEl.createDiv({ cls: 'setting-item-description' })
    desc.setAttribute('data-testid', 'settings-claude-cli-path-description')
    desc.setText(
      'Specorator does not handle your Claude.ai credentials. The `claude` CLI you installed manages its own login.',
    )

    statusEl = containerEl.createDiv({ cls: 'setting-item-description' })
    statusEl.setAttribute('data-testid', 'settings-claude-cli-path-status')
    statusEl.setText('')
  }

  /**
   * Autodetect handler — runs `ClaudeBinaryResolver.resolve()`, writes the
   * result back into the input on success, and reports outcome via the
   * inline status node (REQ-ASM-004, REQ-ASM-005).
   */
  private async handleAutodetect(
    input: HTMLInputElement | null,
    statusEl: HTMLElement | null,
  ): Promise<void> {
    this._setStatus(statusEl, 'Searching for the claude CLI on your path…')
    const platform = process.platform as ResolverPlatform
    const outcome = await tryAsync(() => new ClaudeBinaryResolver({ spawn, platform }).resolve())
    if (!outcome.ok) {
      this._setStatus(statusEl, 'Autodetect failed.')
      return
    }
    const resolved = outcome.value
    if (resolved === null) {
      this._setStatus(statusEl, 'Could not find the claude CLI on your path.')
      return
    }
    if (input !== null) {
      input.value = resolved
      input.dispatchEvent(new Event('input'))
    }
    await this.plugin.updateSettings({ claudeCliPath: resolved })
    this._bumpAllViews()
    this._setStatus(statusEl, `Found: ${resolved}`)
  }

  /**
   * Test-binary handler — spawns `<path> --version` synchronously with a 5 s
   * timeout. SPEC §10.2 explicitly allow-lists this single `spawnSync` site
   * for the user-driven settings-tab handler. It is never called on any chat
   * hot path.
   */
  private handleTestBinary(statusEl: HTMLElement | null): void {
    const stored = this.plugin.settings.claudeCliPath.trim()
    if (stored === '' || !path.isAbsolute(stored)) {
      this._setStatus(statusEl, 'Enter an absolute path before testing.')
      return
    }
    const outcome = trySync(() =>
      spawnSync(stored, ['--version'], { timeout: 5_000, encoding: 'utf8' }),
    )
    this._setStatus(statusEl, this._describeTestOutcome(outcome))
  }

  private _describeTestOutcome(
    outcome: ReturnType<typeof trySync<ReturnType<typeof spawnSync>>>,
  ): string {
    if (!outcome.ok) return 'Test failed.'
    const result = outcome.value
    if (result.error !== undefined || result.status !== 0) {
      return 'Test failed — the binary did not respond.'
    }
    const version = String(result.stdout).trim()
    return version.length > 0 ? version : 'Test passed.'
  }

  private _setStatus(statusEl: HTMLElement | null, text: string): void {
    if (statusEl !== null) statusEl.setText(text)
  }

  /**
   * Calls bumpSettingsVersion() on every open Specorator view leaf so the
   * chat re-checks adapter availability after the API key (or CLI path)
   * changes. Covers both the legacy `SpecoratorView` (kept for the tabbed
   * shell) and the new dedicated `AgentSidepanelView` (IDEA-ASV-001).
   * Satisfies T-CCS-037, D-CCS-003.
   */
  private _bumpAllViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      if (leaf.view instanceof SpecoratorView) {
        leaf.view.bumpSettingsVersion()
      }
    }
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_AGENT)) {
      if (leaf.view instanceof AgentSidepanelView) {
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
