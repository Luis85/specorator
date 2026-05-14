import type {
	SettingsPort,
	VaultPort,
	WorkspacePort,
	NotificationPort,
	LoggerPort,
	CommunityPluginPort,
	ActiveFileSnapshot,
	Unsubscriber,
	ClaudeCliPort,
} from '@/domain/ports'
import { type PluginSettings, DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'

const FILE_PREFIX = 'specorator:file:'
const SETTINGS_KEY = 'specorator:settings'
const ENABLED_PLUGINS_KEY = 'specorator:enabled-plugins'

export class LocalStorageBridge
	implements SettingsPort, VaultPort, WorkspacePort, NotificationPort, LoggerPort, CommunityPluginPort, ClaudeCliPort
{
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
      if (key?.startsWith(prefix) === true) {
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
      if (key?.startsWith(prefix) === true) {
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

  getActiveFile(): ActiveFileSnapshot | null {
    return null
  }

  onActiveFileChanged(_handler: (file: ActiveFileSnapshot | null) => void): Unsubscriber {
    // no active-file concept in browser bridge
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    return () => {}
  }

  showError(message: string, durationMs = 0): void {
    window.dispatchEvent(
      new CustomEvent('sp:notice', { detail: { severity: 'error', message, durationMs } }),
    )
  }

  showWarning(message: string, durationMs = 8000): void {
    window.dispatchEvent(
      new CustomEvent('sp:notice', { detail: { severity: 'warning', message, durationMs } }),
    )
  }

  showSuccess(message: string, durationMs = 4000): void {
    window.dispatchEvent(
      new CustomEvent('sp:notice', { detail: { severity: 'success', message, durationMs } }),
    )
  }

  showInfo(message: string, durationMs = 4000): void {
    window.dispatchEvent(
      new CustomEvent('sp:notice', { detail: { severity: 'info', message, durationMs } }),
    )
  }

  async getSettings(): Promise<PluginSettings> {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw === null || raw === '') return { ...DEFAULT_SETTINGS }
    try {
      const parsed = JSON.parse(raw) as Partial<PluginSettings>
      return { ...DEFAULT_SETTINGS, ...parsed }
    } catch {
      return { ...DEFAULT_SETTINGS }
    }
  }

  async saveSettings(settings: PluginSettings): Promise<void> {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  }

  // ── LoggerPort ────────────────────────────────────────────────────────────
  // Console is the only output channel available in a browser-only bridge;
  // the obsidianmd/rule-custom-message (no-console) ban does not apply here.
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
  }

  /* eslint-enable obsidianmd/rule-custom-message */

  // ── CommunityPluginPort ───────────────────────────────────────────────────

  isPluginEnabled(id: string): boolean {
    return this.listEnabledPluginIds().includes(id)
  }

  listEnabledPluginIds(): string[] {
    try {
      const raw = localStorage.getItem(ENABLED_PLUGINS_KEY)
      if (raw === null) return []
      const parsed: unknown = JSON.parse(raw)
      return Array.isArray(parsed) ? (parsed as string[]) : []
    } catch {
      return []
    }
  }

  // ── ClaudeCliPort ─────────────────────────────────────────────────────────

  isAvailable(): Promise<boolean> {
    return Promise.resolve(false)
  }
}
