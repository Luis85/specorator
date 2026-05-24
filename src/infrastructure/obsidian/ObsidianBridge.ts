import { FileSystemAdapter, Notice, TFile, TFolder, normalizePath, type App } from 'obsidian';
import { DEFAULT_SETTINGS, type PluginSettings } from '@/domain/settings/PluginSettings';
import { trySync } from '@/domain/shared/tryAsync';
import type {
	SettingsPort,
	VaultPort,
	WorkspacePort,
	NotificationPort,
	LoggerPort,
	CommunityPluginPort,
	ChatRuntimePort,
	MarkdownRenderPort,
} from '@/domain/ports';
import { ClaudeCliChatRuntime } from './ClaudeCliChatRuntime';
import { safeMarkdownRenderPort } from '@/application/chat/safeMarkdownRenderPort';

type FileManagerWithTrash = App['fileManager'] & {
	trashFile?: (file: TFile) => Promise<void>;
};

/**
 * Production bridge wrapping Obsidian's `App` + `Vault`. P0 reboot
 * (SPEC-PSR-009): implements only the six core ports. The chat/icon members
 * were removed with their subsystems; settings persist to the device-local
 * store (ADR-PSR-002), never `data.json`.
 */
export class ObsidianBridge
	implements
		SettingsPort,
		VaultPort,
		WorkspacePort,
		NotificationPort,
		LoggerPort,
		CommunityPluginPort
{
	private static readonly _LEVEL_RANK: Record<string, number> = {
		debug: 0,
		info: 1,
		warn: 2,
		error: 3,
	};

	private readonly _activeNotices = new Set<Notice>();

	/** Stable device-local key for the user/device-scoped settings blob (ADR-PSR-002). */
	private static readonly _SETTINGS_KEY = 'specorator:settings';

	constructor(private readonly app: App) {}

	async readFile(path: string): Promise<string> {
		const normalized = normalizePath(path);
		const file = this.app.vault.getAbstractFileByPath(normalized);
		if (!(file instanceof TFile)) throw new Error(`File not found: ${normalized}`);
		return this.app.vault.read(file);
	}

	async writeFile(path: string, content: string): Promise<void> {
		const normalized = normalizePath(path);
		const existing = this.app.vault.getAbstractFileByPath(normalized);
		if (existing instanceof TFile) {
			await this.app.vault.modify(existing, content);
		} else {
			await this.app.vault.create(normalized, content);
		}
	}

	async deleteFile(path: string): Promise<void> {
		const normalized = normalizePath(path);
		const file = this.app.vault.getAbstractFileByPath(normalized);
		if (file instanceof TFile) {
			const fileManager = this.app.fileManager as FileManagerWithTrash;
			if (typeof fileManager.trashFile === 'function') {
				await fileManager.trashFile(file);
				return;
			}
			// Compatibility fallback for Obsidian versions below FileManager.trashFile.
			// eslint-disable-next-line obsidianmd/prefer-file-manager-trash-file
			await this.app.vault.delete(file);
		}
	}

	async listFiles(folder: string): Promise<string[]> {
		const normalized = normalizePath(folder);
		const dir = this.app.vault.getAbstractFileByPath(normalized);
		if (!(dir instanceof TFolder)) return [];
		return dir.children.filter((f): f is TFile => f instanceof TFile).map((f) => f.path);
	}

	async listFolders(parent: string): Promise<string[]> {
		const normalized = normalizePath(parent);
		const dir = this.app.vault.getAbstractFileByPath(normalized);
		if (!(dir instanceof TFolder)) return [];
		return dir.children.filter((f): f is TFolder => f instanceof TFolder).map((f) => f.name);
	}

	async fileExists(path: string): Promise<boolean> {
		const normalized = normalizePath(path);
		return this.app.vault.getAbstractFileByPath(normalized) instanceof TFile;
	}

	async createFolder(path: string): Promise<void> {
		const normalized = normalizePath(path);
		if (!(this.app.vault.getAbstractFileByPath(normalized) instanceof TFolder)) {
			await this.app.vault.createFolder(normalized);
		}
	}

	async openFile(path: string): Promise<void> {
		const normalized = normalizePath(path);
		const file = this.app.vault.getAbstractFileByPath(normalized);
		if (file instanceof TFile) {
			await this.app.workspace.getLeaf().openFile(file);
		}
	}

	// ── Chat runtime factory (SPEC-CC-013, ADR-CC-001 §6) ───────────────────────
	// Returns a fresh per-conversation `ClaudeCliChatRuntime` (desktop-only
	// subprocess; coverage-excluded — manual TEST-CC-017). Passes `this` as the
	// LoggerPort for diagnostics (no message content logged) and the vault root as
	// the child cwd so relative paths in CLI tool calls resolve inside the vault.
	// Reads/writes no secret (NFR-CC-006). Each call is a new instance.
	createChatRuntime(): ChatRuntimePort {
		return new ClaudeCliChatRuntime(this, this.getVaultBasePath());
	}

	// ── Markdown render port (SPEC-CC-013, SPEC-CC-015) ─────────────────────────
	// The P1 `safeMarkdownRender`-backed port (structured nodes, no HTML sink).
	// Identical behaviour across all three bridges in P1; P2 re-backs the same
	// port shape with Obsidian's `MarkdownRenderer.render`.
	createMarkdownRenderPort(): MarkdownRenderPort {
		return safeMarkdownRenderPort;
	}

	private _track(notice: Notice): void {
		this._activeNotices.add(notice);
		const el: HTMLElement = notice.messageEl;
		el.addEventListener(
			'animationend',
			() => {
				this._activeNotices.delete(notice);
			},
			{ once: true },
		);
	}

	hideAllNotices(): void {
		for (const n of this._activeNotices) n.hide();
		this._activeNotices.clear();
	}

	showError(message: string, durationMs = 0): void {
		this._track(new Notice(`[Error] ${message}`, durationMs));
	}

	showWarning(message: string, durationMs = 8000): void {
		this._track(new Notice(`[Warning] ${message}`, durationMs));
	}

	showSuccess(message: string, durationMs = 4000): void {
		this._track(new Notice(`[✓] ${message}`, durationMs));
	}

	showInfo(message: string, durationMs = 4000): void {
		this._track(new Notice(`[Info] ${message}`, durationMs));
	}

	async getSettings(): Promise<PluginSettings> {
		return this._readDeviceLocalSettings();
	}

	async saveSettings(settings: PluginSettings): Promise<void> {
		// Device-local store (ADR-PSR-002 / REQ-PSR-013): never data.json
		// (NFR-PSR-010). The settings blob is git-committed + Obsidian-Sync'd
		// from data.json on collaborative vaults, so per-device prefs must not
		// live there.
		this.app.saveLocalStorage(ObsidianBridge._SETTINGS_KEY, JSON.stringify(settings));
	}

	/**
	 * Load-or-default read of the device-local settings blob (CHARTER-REQ-FRESH /
	 * NG8 — no migration). Returns DEFAULT_SETTINGS when nothing is stored or the
	 * blob is unparseable. Field-level validation happens at write time
	 * (coreSettingsModule.validateSettings via plugin.updateSettings); this read
	 * is the defensive load-or-default boundary.
	 */
	private _readDeviceLocalSettings(): PluginSettings {
		const raw: unknown = this.app.loadLocalStorage(ObsidianBridge._SETTINGS_KEY);
		if (typeof raw !== 'string') return { ...DEFAULT_SETTINGS };
		const parsed = trySync(() => JSON.parse(raw) as unknown);
		if (!parsed.ok || parsed.value === null || typeof parsed.value !== 'object') {
			return { ...DEFAULT_SETTINGS };
		}
		const obj = parsed.value as Partial<Record<keyof PluginSettings, unknown>>;
		const levels = ['debug', 'info', 'warn', 'error'] as const;
		const locale =
			typeof obj.locale === 'string' && obj.locale.trim() ? obj.locale : DEFAULT_SETTINGS.locale;
		const rawLevel = obj.logLevel;
		const logLevel =
			typeof rawLevel === 'string' && (levels as readonly string[]).includes(rawLevel)
				? (rawLevel as PluginSettings['logLevel'])
				: DEFAULT_SETTINGS.logLevel;
		return { locale, logLevel };
	}

	private _shouldLog(level: 'debug' | 'info' | 'warn' | 'error'): boolean {
		const configured = this._readDeviceLocalSettings().logLevel;
		return (
			(ObsidianBridge._LEVEL_RANK[level] ?? 0) >= (ObsidianBridge._LEVEL_RANK[configured] ?? 0)
		);
	}

	// ── LoggerPort ────────────────────────────────────────────────────────────
	// The obsidianmd plugin guidelines discourage console in plugin code, but
	// structured logging via console is the correct implementation for a logger
	// bridge; we suppress the rule for this section only.
	/* eslint-disable obsidianmd/rule-custom-message */

	debug(message: string, context?: Record<string, unknown>): void {
		if (!this._shouldLog('debug')) return;
		console.debug(`[Specorator] ${message}`, context);
	}

	info(message: string, context?: Record<string, unknown>): void {
		if (!this._shouldLog('info')) return;
		console.info(`[Specorator] ${message}`, context);
	}

	warn(message: string, context?: Record<string, unknown>): void {
		if (!this._shouldLog('warn')) return;
		console.warn(`[Specorator] ${message}`, context);
	}

	error(message: string, error?: unknown, context?: Record<string, unknown>): void {
		if (!this._shouldLog('error')) return;
		console.error(`[Specorator] ${message}`, error, context);
		// LoggerPort is logging-only; user-visible error notices go through NotificationPort.showError().
	}

	/* eslint-enable obsidianmd/rule-custom-message */

	// ── CommunityPluginPort ───────────────────────────────────────────────────

	isPluginEnabled(id: string): boolean {
		const enabled = this._getEnabledPlugins();
		return enabled?.has(id) ?? false;
	}

	listEnabledPluginIds(): string[] {
		const enabled = this._getEnabledPlugins();
		return enabled !== null ? Array.from(enabled) : [];
	}

	private _getEnabledPlugins(): Set<string> | null {
		// app.plugins is not in Obsidian's public TypeScript types but is a stable
		// runtime property present since Obsidian 0.9.x. enabledPlugins is a Set<string>
		// at runtime (not a plain object). We access it via a typed interface to stay
		// within the ESLint rules.
		interface AppWithPlugins {
			plugins?: {
				enabledPlugins?: Set<string>;
			};
		}
		const appExt = this.app as unknown as AppWithPlugins;
		return appExt.plugins?.enabledPlugins ?? null;
	}

	// ── Vault filesystem root ─────────────────────────────────────────────────
	// QW-A — expose the vault root so a later phase's CLI subprocesses can inherit
	// it as `cwd`. On desktop `vault.adapter` is a `FileSystemAdapter`; on mobile
	// (or any non-FS adapter) we return `null`.
	getVaultBasePath(): string | null {
		const adapter = this.app.vault.adapter;
		if (adapter instanceof FileSystemAdapter) {
			return adapter.getBasePath();
		}
		return null;
	}
}
