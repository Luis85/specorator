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

const FILE_PREFIX = 'specorator:file:';
const SETTINGS_KEY = 'specorator:settings';
const ENABLED_PLUGINS_KEY = 'specorator:enabled-plugins';

export class LocalStorageBridge
	implements
		SettingsPort,
		VaultPort,
		WorkspacePort,
		NotificationPort,
		LoggerPort,
		CommunityPluginPort,
		ChatTransportPort,
		IconPort
{
	// QW-A — no real filesystem in the GitHub Pages demo; subprocess transports
	// are unavailable here, so the cwd resolver returns null.
	getVaultBasePath(): string | null {
		return null;
	}

	async readFile(path: string): Promise<string> {
		const value = localStorage.getItem(FILE_PREFIX + path);
		if (value === null) throw new Error(`File not found: ${path}`);
		return value;
	}

	async writeFile(path: string, content: string): Promise<void> {
		localStorage.setItem(FILE_PREFIX + path, content);
	}

	async deleteFile(path: string): Promise<void> {
		localStorage.removeItem(FILE_PREFIX + path);
	}

	async listFiles(folder: string): Promise<string[]> {
		// Codex P1 on PR #376: empty-string root must enumerate top-level
		// files. The previous prefix `FILE_PREFIX + '/'` matched none of the
		// stored `specorator:file:<path>` keys (they have no leading slash),
		// breaking the `@`-mention picker in standalone/web mode where it
		// kicked off a recursive vault walk from `''`.
		const isRoot = folder === '';
		const prefix = isRoot
			? FILE_PREFIX
			: FILE_PREFIX + (folder.endsWith('/') ? folder : folder + '/');
		const stripLength = isRoot ? 0 : folder.endsWith('/') ? folder.length : folder.length + 1;
		const results: string[] = [];
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i);
			if (key?.startsWith(prefix) === true) {
				const filePath = key.slice(FILE_PREFIX.length);
				const relative = filePath.slice(stripLength);
				if (!relative.includes('/')) results.push(filePath);
			}
		}
		return results;
	}

	async listFolders(parent: string): Promise<string[]> {
		// Codex P1 on PR #376: symmetric fix for the empty-root case.
		const isRoot = parent === '';
		const prefix = isRoot
			? FILE_PREFIX
			: FILE_PREFIX + (parent.endsWith('/') ? parent : parent + '/');
		const stripLength = isRoot ? 0 : parent.endsWith('/') ? parent.length : parent.length + 1;
		const folders = new Set<string>();
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i);
			if (key?.startsWith(prefix) === true) {
				const filePath = key.slice(FILE_PREFIX.length);
				const relative = filePath.slice(stripLength);
				const slash = relative.indexOf('/');
				if (slash !== -1) {
					folders.add(relative.slice(0, slash));
				}
			}
		}
		return Array.from(folders);
	}

	async fileExists(path: string): Promise<boolean> {
		return localStorage.getItem(FILE_PREFIX + path) !== null;
	}

	async createFolder(_path: string): Promise<void> {
		// localStorage has no real folders; they are implied by file key prefixes
	}

	async openFile(path: string): Promise<void> {
		window.dispatchEvent(new CustomEvent('sp:open-file', { detail: { path } }));
	}

	getActiveFile(): ActiveFileSnapshot | null {
		return null;
	}

	onActiveFileChanged(_handler: (file: ActiveFileSnapshot | null) => void): Unsubscriber {
		// no active-file concept in browser bridge
		// eslint-disable-next-line @typescript-eslint/no-empty-function
		return () => {};
	}

	// QW-B — the GitHub Pages standalone demo has no Obsidian editor surface;
	// there is no "active note" and no editor selection to query. Returning
	// null lets the suffix composer skip the <vault-context> block entirely
	// for browser-only users (who, in turn, have no CLI subprocess to feed
	// the context to — the demo bridge's queryStream is the degraded stub).
	getActiveFilePath(): string | null {
		return null;
	}

	getActiveSelection(): string | null {
		return null;
	}

	showError(message: string, durationMs = 0): void {
		window.dispatchEvent(
			new CustomEvent('sp:notice', { detail: { severity: 'error', message, durationMs } }),
		);
	}

	showWarning(message: string, durationMs = 8000): void {
		window.dispatchEvent(
			new CustomEvent('sp:notice', { detail: { severity: 'warning', message, durationMs } }),
		);
	}

	showSuccess(message: string, durationMs = 4000): void {
		window.dispatchEvent(
			new CustomEvent('sp:notice', { detail: { severity: 'success', message, durationMs } }),
		);
	}

	showInfo(message: string, durationMs = 4000): void {
		window.dispatchEvent(
			new CustomEvent('sp:notice', { detail: { severity: 'info', message, durationMs } }),
		);
	}

	async getSettings(): Promise<PluginSettings> {
		const raw = localStorage.getItem(SETTINGS_KEY);
		if (raw === null || raw === '') return { ...DEFAULT_SETTINGS };
		try {
			const parsed = JSON.parse(raw) as Partial<PluginSettings>;
			return { ...DEFAULT_SETTINGS, ...parsed };
		} catch {
			return { ...DEFAULT_SETTINGS };
		}
	}

	async saveSettings(settings: PluginSettings): Promise<void> {
		localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
	}

	// ── LoggerPort ────────────────────────────────────────────────────────────
	// Console is the only output channel available in a browser-only bridge;
	// the obsidianmd/rule-custom-message (no-console) ban does not apply here.
	/* eslint-disable obsidianmd/rule-custom-message */

	debug(message: string, context?: Record<string, unknown>): void {
		console.debug(`[Specorator] ${message}`, context);
	}

	info(message: string, context?: Record<string, unknown>): void {
		console.info(`[Specorator] ${message}`, context);
	}

	warn(message: string, context?: Record<string, unknown>): void {
		console.warn(`[Specorator] ${message}`, context);
	}

	error(message: string, error?: unknown, context?: Record<string, unknown>): void {
		console.error(`[Specorator] ${message}`, error, context);
	}

	/* eslint-enable obsidianmd/rule-custom-message */

	// ── CommunityPluginPort ───────────────────────────────────────────────────

	isPluginEnabled(id: string): boolean {
		return this.listEnabledPluginIds().includes(id);
	}

	listEnabledPluginIds(): string[] {
		try {
			const raw = localStorage.getItem(ENABLED_PLUGINS_KEY);
			if (raw === null) return [];
			const parsed: unknown = JSON.parse(raw);
			return Array.isArray(parsed) ? (parsed as string[]) : [];
		} catch {
			return [];
		}
	}

	// ── ChatTransportPort ─────────────────────────────────────────────────────────

	isAvailable(): Promise<boolean> {
		return Promise.resolve(false);
	}

	// eslint-disable-next-line @typescript-eslint/require-await
	async *queryStream(
		_prompt: string,
		_options?: ChatTransportStreamOptions,
	): AsyncIterable<StreamDelta> {
		yield {
			type: 'error',
			error: new ChatTransportError('NOT_INSTALLED', 'LocalStorageBridge: not available'),
		};
	}

	// ── IconPort ──────────────────────────────────────────────────────────────
	// REQ-AUX-001, ADR-AUX-001 — mirrors MockBridge so the GitHub Pages demo
	// renders the same deterministic placeholder. No Obsidian runtime is
	// available in standalone mode.
	setIcon(el: HTMLElement, name: string): void {
		while (el.firstChild) el.removeChild(el.firstChild);
		const svgNS = 'http://www.w3.org/2000/svg';
		// LocalStorageBridge backs the GitHub Pages standalone demo — there
		// is no Obsidian `activeDocument`; use the element's owner document.
		const svg = el.ownerDocument.createElementNS(svgNS, 'svg');
		svg.setAttribute('data-icon', name);
		svg.setAttribute('aria-hidden', 'true');
		const title = el.ownerDocument.createElementNS(svgNS, 'title');
		title.textContent = name;
		svg.appendChild(title);
		el.appendChild(svg);
	}
}
