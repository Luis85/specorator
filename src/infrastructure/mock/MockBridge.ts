import type {
	SettingsPort,
	VaultPort,
	WorkspacePort,
	NotificationPort,
	LoggerPort,
} from '@/domain/ports'
import { type PluginSettings, DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'

/**
 * In-memory bridge used in standalone dev mode and unit tests.
 * Provides test helper methods for inspecting state.
 */
export class MockBridge
	implements SettingsPort, VaultPort, WorkspacePort, NotificationPort, LoggerPort
{
  private readonly files = new Map<string, string>()
  private readonly folders = new Set<string>()
  private settings: PluginSettings = { ...DEFAULT_SETTINGS }
  private readonly noticeLog: {
    severity: 'error' | 'warning' | 'success' | 'info'
    message: string
    durationMs: number
  }[] = []
  readonly logEntries: Array<{
    level: 'debug' | 'info' | 'warn' | 'error'
    message: string
    error?: unknown
    context?: Record<string, unknown>
  }> = []
  private openedFile: string | null = null

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
    return [...this.files.keys()].filter((p) => {
      if (!p.startsWith(prefix)) return false
      return !p.slice(prefix.length).includes('/')
    })
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

  async openFile(path: string): Promise<void> {
    this.openedFile = path
  }

  showError(message: string, durationMs = 0): void {
    this.noticeLog.push({ severity: 'error', message, durationMs })
    console.error(`[MockBridge Notice:error] ${message}`)
  }

  showWarning(message: string, durationMs = 8000): void {
    this.noticeLog.push({ severity: 'warning', message, durationMs })
    console.warn(`[MockBridge Notice:warning] ${message}`)
  }

  showSuccess(message: string, durationMs = 4000): void {
    this.noticeLog.push({ severity: 'success', message, durationMs })
    console.info(`[MockBridge Notice:success] ${message}`)
  }

  showInfo(message: string, durationMs = 4000): void {
    this.noticeLog.push({ severity: 'info', message, durationMs })
    console.info(`[MockBridge Notice:info] ${message}`)
  }

  async getSettings(): Promise<PluginSettings> {
    return { ...this.settings }
  }

  async saveSettings(settings: PluginSettings): Promise<void> {
    this.settings = { ...settings }
  }

  // ── Test helpers ──────────────────────────────────────────────────────────

  getNotices(): {
    severity: 'error' | 'warning' | 'success' | 'info'
    message: string
    durationMs: number
  }[] {
    return [...this.noticeLog]
  }

  getOpenedFile(): string | null {
    return this.openedFile
  }

  getAllFiles(): Record<string, string> {
    return Object.fromEntries(this.files)
  }

  seedSettings(partial: Partial<PluginSettings>): void {
    this.settings = { ...this.settings, ...partial }
  }

  // ── LoggerPort ────────────────────────────────────────────────────────────

  debug(message: string, context?: Record<string, unknown>): void {
    this.logEntries.push({ level: 'debug', message, context })
    console.debug(`[MockBridge] ${message}`, context)
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.logEntries.push({ level: 'info', message, context })
    console.info(`[MockBridge] ${message}`, context)
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.logEntries.push({ level: 'warn', message, context })
    console.warn(`[MockBridge] ${message}`, context)
  }

  error(message: string, error?: unknown, context?: Record<string, unknown>): void {
    this.logEntries.push({ level: 'error', message, error, context })
    console.error(`[MockBridge] ${message}`, error, context)
  }
}
