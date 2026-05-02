import type { IBridge, PluginSettings } from '../bridge/IBridge'
import { DEFAULT_SETTINGS } from '../bridge/IBridge'

/**
 * In-memory bridge used in standalone dev mode and unit tests.
 * Provides test helper methods for inspecting state.
 */
export class MockBridge implements IBridge {
  private readonly files = new Map<string, string>()
  private readonly folders = new Set<string>()
  private settings: PluginSettings = { ...DEFAULT_SETTINGS }
  private readonly noticeLog: Array<{ message: string; durationMs: number }> = []

  constructor(initialFiles: Record<string, string> = {}) {
    for (const [path, content] of Object.entries(initialFiles)) {
      this.files.set(path, content)
      // Register parent folders automatically
      const parts = path.split('/')
      for (let i = 1; i < parts.length; i++) {
        this.folders.add(parts.slice(0, i).join('/'))
      }
    }
  }

  async readFile(path: string): Promise<string> {
    const content = this.files.get(path)
    if (content === undefined) throw new Error(`[MockBridge] File not found: ${path}`)
    return content
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content)
  }

  async deleteFile(path: string): Promise<void> {
    this.files.delete(path)
  }

  async listFiles(folder: string): Promise<string[]> {
    const prefix = folder.endsWith('/') ? folder : `${folder}/`
    return [...this.files.keys()].filter((p) => p.startsWith(prefix))
  }

  async listFolders(parent: string): Promise<string[]> {
    const prefix = parent.endsWith('/') ? parent : `${parent}/`
    const names = new Set<string>()
    for (const path of this.files.keys()) {
      if (path.startsWith(prefix)) {
        const rest = path.slice(prefix.length)
        const firstSegment = rest.split('/')[0]
        if (firstSegment && rest.includes('/')) {
          names.add(firstSegment)
        }
      }
    }
    return [...names]
  }

  async fileExists(path: string): Promise<boolean> {
    return this.files.has(path)
  }

  async createFolder(path: string): Promise<void> {
    this.folders.add(path)
  }

  async openFile(_path: string): Promise<void> {
    // No-op in standalone mode
  }

  showNotice(message: string, durationMs = 4000): void {
    this.noticeLog.push({ message, durationMs })
    console.info(`[MockBridge Notice] ${message}`)
  }

  async getSettings(): Promise<PluginSettings> {
    return { ...this.settings }
  }

  async saveSettings(settings: PluginSettings): Promise<void> {
    this.settings = { ...settings }
  }

  // ── Test helpers ──────────────────────────────────────────────────────────

  getNotices(): Array<{ message: string; durationMs: number }> {
    return [...this.noticeLog]
  }

  getAllFiles(): Record<string, string> {
    return Object.fromEntries(this.files)
  }

  seedSettings(partial: Partial<PluginSettings>): void {
    this.settings = { ...this.settings, ...partial }
  }
}
