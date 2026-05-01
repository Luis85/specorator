import { Notice, TFile, TFolder, type App } from 'obsidian'
import type { IBridge, PluginSettings } from '../bridge/IBridge'

export class ObsidianBridge implements IBridge {
  constructor(
    private readonly app: App,
    private settings: PluginSettings,
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
    return { ...this.settings }
  }

  async saveSettings(settings: PluginSettings): Promise<void> {
    this.settings = { ...settings }
    await this.onSaveSettings(settings)
  }
}
