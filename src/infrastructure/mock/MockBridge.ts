import type {
	SettingsPort,
	VaultPort,
	WorkspacePort,
	NotificationPort,
	LoggerPort,
	CommunityPluginPort,
	ActiveFileSnapshot,
	Unsubscriber,
	ChatTransportPort,
	ChatTransportStreamOptions,
	StreamDelta,
	IconPort,
} from '@/domain/ports';
import { ChatTransportError } from '@/domain/ports';
import { type PluginSettings, DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings';

function folderPrefix(parent: string): string {
	if (parent === '') return '';
	return parent.endsWith('/') ? parent : `${parent}/`;
}

/**
 * In-memory bridge used in standalone dev mode and unit tests.
 * Provides test helper methods for inspecting state.
 */
export class MockBridge
	implements
		SettingsPort,
		VaultPort,
		WorkspacePort,
		NotificationPort,
		LoggerPort,
		ChatTransportPort,
		CommunityPluginPort,
		IconPort
{
	private readonly files = new Map<string, string>();
	private readonly folders = new Set<string>();
	private settings: PluginSettings = { ...DEFAULT_SETTINGS };
	private enabledPluginIds = new Set<string>();
	private readonly noticeLog: {
		severity: 'error' | 'warning' | 'success' | 'info';
		message: string;
		durationMs: number;
	}[] = [];
	readonly logEntries: Array<{
		level: 'debug' | 'info' | 'warn' | 'error';
		message: string;
		error?: unknown;
		context?: Record<string, unknown>;
	}> = [];
	private openedFile: string | null = null;
	private activeFile: ActiveFileSnapshot | null = null;
	// QW-B — the active-note path and current editor selection. Kept separate
	// from `activeFile` because `setActiveFilePath` is the lighter test fixture
	// used by `buildTurnInput` callers that don't care about basename/extension.
	private _activeFilePath: string | null = null;
	private _activeSelection: string | null = null;
	private readonly activeFileHandlers = new Set<(f: ActiveFileSnapshot | null) => void>();
	private readonly missingIcons = new Set<string>();
	private vaultBasePath: string | null;

	constructor(
		initialFiles: Record<string, string> = {},
		options: { vaultBasePath?: string | null } = {},
	) {
		this.vaultBasePath =
			options.vaultBasePath === undefined ? '/mock/vault' : options.vaultBasePath;
		for (const [path, content] of Object.entries(initialFiles)) {
			this.files.set(path, content);
			// Register parent folders automatically
			const parts = path.split('/');
			for (let i = 1; i < parts.length; i++) {
				this.folders.add(parts.slice(0, i).join('/'));
			}
		}
	}

	// QW-A — mirror of `ObsidianBridge.getVaultBasePath()` so tests and the
	// standalone Vite dev server have a deterministic vault root to assert on
	// without booting Obsidian. Defaults to `/mock/vault`; pass `null` to
	// model the standalone-web case where no FS root exists.
	getVaultBasePath(): string | null {
		return this.vaultBasePath;
	}

	setVaultBasePath(path: string | null): void {
		this.vaultBasePath = path;
	}

	async readFile(path: string): Promise<string> {
		const content = this.files.get(path);
		if (content === undefined) throw new Error(`[MockBridge] File not found: ${path}`);
		return content;
	}

	async writeFile(path: string, content: string): Promise<void> {
		this.files.set(path, content);
	}

	async deleteFile(path: string): Promise<void> {
		this.files.delete(path);
	}

	async listFiles(folder: string): Promise<string[]> {
		// Root listing: top-level files have no `/` in their path. Honours
		// `listFiles('')` symmetry with Obsidian's `vault.getAbstractFileByPath('/')`
		// (PR-ASV-4, recursive walker for the @-mention picker).
		if (folder === '') {
			return [...this.files.keys()].filter((p) => !p.includes('/'));
		}
		const prefix = folder.endsWith('/') ? folder : `${folder}/`;
		return [...this.files.keys()].filter((p) => {
			if (!p.startsWith(prefix)) return false;
			return !p.slice(prefix.length).includes('/');
		});
	}

	async listFolders(parent: string): Promise<string[]> {
		const prefix = folderPrefix(parent);
		const names = new Set<string>();
		for (const folder of this.folders) {
			if (folder.startsWith(prefix)) {
				const rest = folder.slice(prefix.length);
				if (rest && !rest.includes('/')) names.add(rest);
			}
		}
		for (const path of this.files.keys()) {
			if (!prefix || path.startsWith(prefix)) {
				const rest = path.slice(prefix.length);
				const firstSegment = rest.split('/')[0];
				if (firstSegment && rest.includes('/')) names.add(firstSegment);
			}
		}
		return [...names];
	}

	async fileExists(path: string): Promise<boolean> {
		return this.files.has(path);
	}

	async createFolder(path: string): Promise<void> {
		this.folders.add(path);
	}

	async openFile(path: string): Promise<void> {
		this.openedFile = path;
		if (!this.files.has(path)) return;
		const filename = path.split('/').pop() ?? path;
		const dot = filename.lastIndexOf('.');
		const snapshot: ActiveFileSnapshot = {
			path,
			basename: dot !== -1 ? filename.slice(0, dot) : filename,
			extension: dot !== -1 ? filename.slice(dot + 1) : '',
		};
		this.activeFile = snapshot;
		for (const handler of this.activeFileHandlers) {
			handler({ ...snapshot });
		}
	}

	getActiveFile(): ActiveFileSnapshot | null {
		return this.activeFile !== null ? { ...this.activeFile } : null;
	}

	onActiveFileChanged(handler: (f: ActiveFileSnapshot | null) => void): Unsubscriber {
		this.activeFileHandlers.add(handler);
		return () => {
			this.activeFileHandlers.delete(handler);
		};
	}

	setActiveFile(file: ActiveFileSnapshot | null): void {
		this.activeFile = file !== null ? { ...file } : null;
		for (const handler of this.activeFileHandlers) {
			handler(this.activeFile !== null ? { ...this.activeFile } : null);
		}
	}

	// QW-B — `WorkspacePort.getActiveFilePath` / `getActiveSelection` and
	// matching test fixtures. Used by `buildTurnInput` to inject a
	// `<vault-context>` block into the system-prompt suffix.
	getActiveFilePath(): string | null {
		return this._activeFilePath;
	}

	getActiveSelection(): string | null {
		return this._activeSelection;
	}

	setActiveFilePath(path: string | null): void {
		this._activeFilePath = path;
	}

	setActiveSelection(text: string | null): void {
		this._activeSelection = text;
	}

	showError(message: string, durationMs = 0): void {
		this.noticeLog.push({ severity: 'error', message, durationMs });
		console.error(`[MockBridge Notice:error] ${message}`);
	}

	showWarning(message: string, durationMs = 8000): void {
		this.noticeLog.push({ severity: 'warning', message, durationMs });
		console.warn(`[MockBridge Notice:warning] ${message}`);
	}

	showSuccess(message: string, durationMs = 4000): void {
		this.noticeLog.push({ severity: 'success', message, durationMs });
		console.info(`[MockBridge Notice:success] ${message}`);
	}

	showInfo(message: string, durationMs = 4000): void {
		this.noticeLog.push({ severity: 'info', message, durationMs });
		console.info(`[MockBridge Notice:info] ${message}`);
	}

	async getSettings(): Promise<PluginSettings> {
		return { ...this.settings };
	}

	async saveSettings(settings: PluginSettings): Promise<void> {
		this.settings = { ...settings };
	}

	// ── Test helpers ─────────────────────────────────────────────────────────────

	getNotices(): {
		severity: 'error' | 'warning' | 'success' | 'info';
		message: string;
		durationMs: number;
	}[] {
		return [...this.noticeLog];
	}

	/**
	 * Test-facing accessor for the captured notice log. Returns a defensive
	 * copy so callers cannot mutate internal state. Equivalent to `getNotices()`
	 * but exposed as a property for test ergonomics (e.g. `expect(bridge.notices).toEqual([])`).
	 */
	get notices(): readonly {
		severity: 'error' | 'warning' | 'success' | 'info';
		message: string;
		durationMs: number;
	}[] {
		return [...this.noticeLog];
	}

	getOpenedFile(): string | null {
		return this.openedFile;
	}

	getAllFiles(): Record<string, string> {
		return Object.fromEntries(this.files);
	}

	seedSettings(partial: Partial<PluginSettings>): void {
		this.settings = { ...this.settings, ...partial };
	}

	// ── LoggerPort ───────────────────────────────────────────────────────────────

	debug(message: string, context?: Record<string, unknown>): void {
		this.logEntries.push({ level: 'debug', message, context });
		console.debug(`[MockBridge] ${message}`, context);
	}

	info(message: string, context?: Record<string, unknown>): void {
		this.logEntries.push({ level: 'info', message, context });
		console.info(`[MockBridge] ${message}`, context);
	}

	warn(message: string, context?: Record<string, unknown>): void {
		this.logEntries.push({ level: 'warn', message, context });
		console.warn(`[MockBridge] ${message}`, context);
	}

	error(message: string, error?: unknown, context?: Record<string, unknown>): void {
		this.logEntries.push({ level: 'error', message, error, context });
		console.error(`[MockBridge] ${message}`, error, context);
	}

	// ── IconPort ──────────────────────────────────────────────────────────────
	// REQ-AUX-001, ADR-AUX-001 — deterministic placeholder so tests assert on
	// the icon name without booting Obsidian. Idempotent: prior children are
	// cleared before re-rendering. When a name has been registered as missing
	// via `markIconAsMissing(name)`, the element is left untouched so the
	// `<SpIcon>` text fallback path can be exercised.
	setIcon(el: HTMLElement, name: string): void {
		if (this.missingIcons.has(name)) return;
		while (el.firstChild) el.removeChild(el.firstChild);
		const svgNS = 'http://www.w3.org/2000/svg';
		// MockBridge is exclusively used in unit tests + the standalone Vite
		// dev server — there is no Obsidian `activeDocument` to defer to.
		// eslint-disable-next-line obsidianmd/prefer-active-doc
		const svg = el.ownerDocument.createElementNS(svgNS, 'svg');
		svg.setAttribute('data-icon', name);
		svg.setAttribute('aria-hidden', 'true');
		// eslint-disable-next-line obsidianmd/prefer-active-doc
		const title = el.ownerDocument.createElementNS(svgNS, 'title');
		title.textContent = name;
		svg.appendChild(title);
		el.appendChild(svg);
	}

	/** Test helper — flag `name` as unresolvable so `setIcon` is a no-op for it. */
	markIconAsMissing(name: string): void {
		this.missingIcons.add(name);
	}

	// ── ChatTransportPort ─────────────────────────────────────────────────────────

	isAvailable(): Promise<boolean> {
		return Promise.resolve(false);
	}

	async *queryStream(
		_prompt: string,
		_options?: ChatTransportStreamOptions,
	): AsyncIterable<StreamDelta> {
		yield {
			type: 'error',
			error: new ChatTransportError('NOT_INSTALLED', 'MockBridge: not available'),
		};
	}

	// ── CommunityPluginPort ───────────────────────────────────────────────────

	isPluginEnabled(id: string): boolean {
		return this.enabledPluginIds.has(id);
	}

	listEnabledPluginIds(): string[] {
		return Array.from(this.enabledPluginIds);
	}

	seedEnabledPlugins(ids: string[]): void {
		this.enabledPluginIds = new Set(ids);
	}
}
