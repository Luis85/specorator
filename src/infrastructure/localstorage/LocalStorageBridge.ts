import type { IBridge, PluginSettings } from '@/infrastructure/bridge/IBridge'
import { DEFAULT_SETTINGS } from '@/infrastructure/bridge/IBridge'

const FILE_PREFIX = 'specorator:file:'
const SETTINGS_KEY = 'specorator:settings'

export class LocalStorageBridge implements IBridge {
  async readFile(path: string): Promise<string> {
    const value = localStorage.getItem(FILE_PREFIX + path)
    if (value === null) throw new Error(`File not found: ${path}`)
    return value
  }

  async writeFile(path: string, content: string): Promise<void> {
    localStorage.setItem(FILE_PREFIX + path, content)
  }

  async deleteFile(path: string): Promise<void> {
    localStorage.removeItem(FILE_PREFIX + path)
  }

  async listFiles(folder: string): Promise<string[]> {
    const prefix = FILE_PREFIX + (folder.endsWith('/') ? folder : folder + '/')
    const results: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(prefix)) {
        const filePath = key.slice(FILE_PREFIX.length)
        const relative = filePath.slice(folder.endsWith('/') ? folder.length : folder.length + 1)
        if (!relative.includes('/')) results.push(filePath)
      }
    }
    return results
  }

  async listFolders(parent: string): Promise<string[]> {
    const prefix = FILE_PREFIX + (parent.endsWith('/') ? parent : parent + '/')
    const folders = new Set<string>()
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(prefix)) {
        const filePath = key.slice(FILE_PREFIX.length)
        const relative = filePath.slice(parent.endsWith('/') ? parent.length : parent.length + 1)
        const slash = relative.indexOf('/')
        if (slash !== -1) {
          folders.add(relative.slice(0, slash))
        }
      }
    }
    return Array.from(folders)
  }

  async fileExists(path: string): Promise<boolean> {
    return localStorage.getItem(FILE_PREFIX + path) !== null
  }

  async createFolder(_path: string): Promise<void> {
    // localStorage has no real folders; they are implied by file key prefixes
  }

  async openFile(path: string): Promise<void> {
    window.dispatchEvent(new CustomEvent('sp:open-file', { detail: { path } }))
  }

  showNotice(message: string, durationMs = 4000): void {
    window.dispatchEvent(new CustomEvent('sp:notice', { detail: { message, durationMs } }))
  }

  async getSettings(): Promise<PluginSettings> {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
    } catch {
      return { ...DEFAULT_SETTINGS }
    }
  }

  async saveSettings(settings: PluginSettings): Promise<void> {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  }
}
