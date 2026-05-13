import { Notice, TFile, TFolder, normalizePath, type App } from 'obsidian'
import type { PluginSettings } from '@/domain/settings/PluginSettings'
import type {
	SettingsPort,
	VaultPort,
	WorkspacePort,
	NotificationPort,
	LoggerPort,
	CommunityPluginPort,
	ActiveFileSnapshot,
	Unsubscriber,
} from '@/domain/ports'

type FileManagerWithTrash = App['fileManager'] & {
  trashFile?: (file: TFile) => Promise<void>
}

export class ObsidianBridge
  implements SettingsPort, VaultPort, WorkspacePort, NotificationPort, LoggerPort, CommunityPluginPort
{
  private static readonly _LEVEL_RANK: Record<string, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  }

  private readonly _activeNotices = new Set<Notice>()

  constructor(
    private readonly app: App,
    private readonly settingsGetter: () => PluginSettings,
    private readonly onSaveSettings: (settings: PluginSettings) => Promise<void>,
  ) {}

  async readFile(path: string): Promise<string> {
    const normalized = normalizePath(path)
    const file = this.app.vault.getAbstractFileByPath(normalized)
    if (!(file instanceof TFile)) throw new Error(`File not found: ${normalized}`)
    return this.app.vault.read(file)
  }

  async writeFile(path: string, content: string): Promise<void> {
    const normalized = normalizePath(path)
    const existing = this.app.vault.getAbstractFileByPath(normalized)
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, content)
    } else {
      await this.app.vault.create(normalized, content)
    }
  }

  async deleteFile(path: string): Promise<void> {
    const normalized = normalizePath(path)
    const file = this.app.vault.getAbstractFileByPath(normalized)
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
    const normalized = normalizePath(folder)
    const dir = this.app.vault.getAbstractFileByPath(normalized)
    if (!(dir instanceof TFolder)) return []
    return dir.children.filter((f): f is TFile => f instanceof TFile).map((f) => f.path)
  }

  async listFolders(parent: string): Promise<string[]> {
    const normalized = normalizePath(parent)
    const dir = this.app.vault.getAbstractFileByPath(normalized)
    if (!(dir instanceof TFolder)) return []
    return dir.children.filter((f): f is TFolder => f instanceof TFolder).map((f) => f.name)
  }

  async fileExists(path: string): Promise<boolean> {
    const normalized = normalizePath(path)
    return this.app.vault.getAbstractFileByPath(normalized) instanceof TFile
  }

  async createFolder(path: string): Promise<void> {
    const normalized = normalizePath(path)
    if (!(this.app.vault.getAbstractFileByPath(normalized) instanceof TFolder)) {
      await this.app.vault.createFolder(normalized)
    }
  }

  async openFile(path: string): Promise<void> {
    const normalized = normalizePath(path)
    const file = this.app.vault.getAbstractFileByPath(normalized)
    if (file instanceof TFile) {
      await this.app.workspace.getLeaf().openFile(file)
    }
  }

  getActiveFile(): ActiveFileSnapshot | null {
    const file = this.app.workspace.getActiveFile()
    if (!file) return null
    return { path: file.path, basename: file.basename, extension: file.extension }
  }

  onActiveFileChanged(handler: (file: ActiveFileSnapshot | null) => void): Unsubscriber {
    const ref = this.app.workspace.on('file-open', (file) => {
      handler(file ? { path: file.path, basename: file.basename, extension: file.extension } : null)
    })
    return () => {
      this.app.workspace.offref(ref)
    }
  }

  private _track(notice: Notice): void {
    this._activeNotices.add(notice)
    // messageEl introduced in Obsidian 1.8.7; fall back to noticeEl for 1.4.0–1.8.6
    // eslint-disable-next-line @typescript-eslint/no-deprecated, @typescript-eslint/no-unnecessary-type-assertion
    const el: HTMLElement = (notice.messageEl as unknown as HTMLElement | undefined) ?? notice.noticeEl
    el.addEventListener(
      'animationend',
      () => {
        this._activeNotices.delete(notice)
      },
      { once: true },
    )
  }

  hideAllNotices(): void {
    for (const n of this._activeNotices) n.hide()
    this._activeNotices.clear()
  }

  showError(message: string, durationMs = 0): void {
    this._track(new Notice(`[Error] ${message}`, durationMs))
  }

  showWarning(message: string, durationMs = 8000): void {
    this._track(new Notice(`[Warning] ${message}`, durationMs))
  }

  showSuccess(message: string, durationMs = 4000): void {
    this._track(new Notice(`[✓] ${message}`, durationMs))
  }

  showInfo(message: string, durationMs = 4000): void {
    this._track(new Notice(`[Info] ${message}`, durationMs))
  }

  async getSettings(): Promise<PluginSettings> {
    return { ...this.settingsGetter() }
  }

  async saveSettings(settings: PluginSettings): Promise<void> {
    await this.onSaveSettings(settings)
  }

  private _shouldLog(level: 'debug' | 'info' | 'warn' | 'error'): boolean {
    const configured = this.settingsGetter().logLevel
    return (
      (ObsidianBridge._LEVEL_RANK[level] ?? 0) >= (ObsidianBridge._LEVEL_RANK[configured] ?? 0)
    )
  }

  // ── LoggerPort ────────────────────────────────────────────────────────────
  // The obsidianmd plugin guidelines discourage console in plugin code, but
  // structured logging via console is the correct implementation for a logger
  // bridge; we suppress the rule for this section only.
  /* eslint-disable obsidianmd/rule-custom-message */

  debug(message: string, context?: Record<string, unknown>): void {
    if (!this._shouldLog('debug')) return
    console.debug(`[Specorator] ${message}`, context)
  }

  info(message: string, context?: Record<string, unknown>): void {
    if (!this._shouldLog('info')) return
    console.info(`[Specorator] ${message}`, context)
  }

  warn(message: string, context?: Record<string, unknown>): void {
    if (!this._shouldLog('warn')) return
    console.warn(`[Specorator] ${message}`, context)
  }

  error(message: string, error?: unknown, context?: Record<string, unknown>): void {
    if (!this._shouldLog('error')) return
    console.error(`[Specorator] ${message}`, error, context)
    // LoggerPort is logging-only; user-visible error notices go through NotificationPort.showError().
  }

  /* eslint-enable obsidianmd/rule-custom-message */

  // ── CommunityPluginPort ───────────────────────────────────────────────────

  isPluginEnabled(id: string): boolean {
    const enabled = this._getEnabledPlugins()
    return enabled !== null && enabled.has(id)
  }

  listEnabledPluginIds(): string[] {
    const enabled = this._getEnabledPlugins()
    return enabled !== null ? Array.from(enabled) : []
  }

  private _getEnabledPlugins(): Set<string> | null {
    // app.plugins is not in Obsidian's public TypeScript types but is a stable
    // runtime property present since Obsidian 0.9.x. enabledPlugins is a Set<string>
    // at runtime (not a plain object). We access it via a typed interface to stay
    // within the ESLint rules.
    interface AppWithPlugins {
      plugins?: {
        enabledPlugins?: Set<string>
      }
    }
    const appExt = this.app as unknown as AppWithPlugins
    return appExt.plugins?.enabledPlugins ?? null
  }
}
