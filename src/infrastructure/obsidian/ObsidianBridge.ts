import { Notice, TFile, TFolder, type App } from 'obsidian'
import type { PluginSettings } from '@/domain/settings/PluginSettings'
import type {
	SettingsPort,
	VaultPort,
	WorkspacePort,
	NotificationPort,
	LoggerPort,
} from '@/domain/ports'

type FileManagerWithTrash = App['fileManager'] & {
  trashFile?: (file: TFile) => Promise<void>
}

export class ObsidianBridge
  implements SettingsPort, VaultPort, WorkspacePort, NotificationPort, LoggerPort
{
  constructor(
    private readonly app: App,
    private readonly settingsGetter: () => PluginSettings,
    private readonly onSaveSettings: (settings: PluginSettings) => Promise<void>,
  ) {}

  async readFile(path: string): Promise<string> {
    const file = this.app.vault.getAbstractFileByPath(path)
    if (!(file instanceof TFile)) throw new Error(`File not found: ${path}`)
    return this.app.vault.read(file)
  }

  async writeFile(path: string, content: string): Promise<void> {
    const existing = this.app.vault.getAbstractFileByPath(path)
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, content)
    } else {
      await this.app.vault.create(path, content)
    }
  }

  async deleteFile(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path)
    if (file instanceof TFile) {
      const fileManager = this.app.fileManager as FileManagerWithTrash
      if (typeof fileManager.trashFile === 'function') {
        await fileManager.trashFile(file)
        return
      }
      // Compatibility fallback for Obsidian versions below FileManager.trashFile.
      // eslint-disable-next-line obsidianmd/prefer-file-manager-trash-file
      await this.app.vault.delete(file)
    }
  }

  async listFiles(folder: string): Promise<string[]> {
    const dir = this.app.vault.getAbstractFileByPath(folder)
    if (!(dir instanceof TFolder)) return []
    return dir.children.filter((f): f is TFile => f instanceof TFile).map((f) => f.path)
  }

  async listFolders(parent: string): Promise<string[]> {
    const dir = this.app.vault.getAbstractFileByPath(parent)
    if (!(dir instanceof TFolder)) return []
    return dir.children.filter((f): f is TFolder => f instanceof TFolder).map((f) => f.name)
  }

  async fileExists(path: string): Promise<boolean> {
    return this.app.vault.getAbstractFileByPath(path) instanceof TFile
  }

  async createFolder(path: string): Promise<void> {
    if (!(this.app.vault.getAbstractFileByPath(path) instanceof TFolder)) {
      await this.app.vault.createFolder(path)
    }
  }

  async openFile(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path)
    if (file instanceof TFile) {
      await this.app.workspace.getLeaf().openFile(file)
    }
  }

  showNotice(message: string, durationMs = 4000): void {
    new Notice(message, durationMs)
  }

  async getSettings(): Promise<PluginSettings> {
    return { ...this.settingsGetter() }
  }

  async saveSettings(settings: PluginSettings): Promise<void> {
    await this.onSaveSettings(settings)
  }

  // ── LoggerPort ────────────────────────────────────────────────────────────
  // The obsidianmd plugin guidelines discourage console in plugin code, but
  // structured logging via console is the correct implementation for a logger
  // bridge; we suppress the rule for this section only.
  /* eslint-disable obsidianmd/rule-custom-message */

  debug(message: string, context?: Record<string, unknown>): void {
    console.debug(`[Specorator] ${message}`, context)
  }

  info(message: string, context?: Record<string, unknown>): void {
    console.info(`[Specorator] ${message}`, context)
  }

  warn(message: string, context?: Record<string, unknown>): void {
    console.warn(`[Specorator] ${message}`, context)
  }

  error(message: string, error?: unknown, context?: Record<string, unknown>): void {
    console.error(`[Specorator] ${message}`, error, context)
    new Notice(`Specorator error: ${message}`, 6000)
  }

  /* eslint-enable obsidianmd/rule-custom-message */
}
