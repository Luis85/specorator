import type {
	SettingsPort,
	VaultPort,
	WorkspacePort,
	NotificationPort,
	LoggerPort,
	CommunityPluginPort,
	ChatRuntimePort,
	MarkdownRenderPort,
	IconPort,
	ProviderHistoryPort,
} from '@/domain/ports';
import { type PluginSettings, DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings';
import { FixtureChatRuntime } from './FixtureChatRuntime';
import { FixtureHistoryStore } from './FixtureHistoryStore';
import { safeMarkdownRenderPort } from '@/application/chat/safeMarkdownRenderPort';
import { staticIconPort } from '@/infrastructure/icons/staticIconPort';

const FILE_PREFIX = 'specorator:file:';
const SETTINGS_KEY = 'specorator:settings';
const ENABLED_PLUGINS_KEY = 'specorator:enabled-plugins';

/**
 * Browser-only bridge for the (deferred) GitHub Pages demo. P0 reboot: kept as a
 * compiling six-core-port class, not referenced by the standalone entry (which
 * uses MockBridge — OC-PSR-2). The chat/icon members were removed with their
 * subsystems.
 */
export class LocalStorageBridge
	implements
		SettingsPort,
		VaultPort,
		WorkspacePort,
		NotificationPort,
		LoggerPort,
		CommunityPluginPort
{
	// QW-A — no real filesystem in the GitHub Pages demo.
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

	// ── Chat runtime factory (SPEC-CC-013, ADR-CC-001 §6) ───────────────────────
	// Returns a fresh per-conversation `FixtureChatRuntime` (replays a bundled
	// transcript, no subprocess) for the GitHub Pages demo. Each call is a new
	// instance for per-conversation state isolation.
	createChatRuntime(): ChatRuntimePort {
		return new FixtureChatRuntime();
	}

	// ── Markdown render port (SPEC-CC-013, SPEC-CC-015, ADR-RR-002) ─────────────
	// The pure `safeMarkdownRender`-backed port (structured nodes, no HTML sink).
	// Per ADR-RR-002 the port is async: this stateless singleton resolves
	// `Promise.resolve(safeMarkdownRender(markdown))` for the GitHub Pages demo
	// (the pure transform stays synchronous).
	createMarkdownRenderPort(): MarkdownRenderPort {
		return safeMarkdownRenderPort;
	}

	// ── Icon port factory (SPEC-RR-012, ADR-RR-001 §4) ──────────────────────────
	// The same static-map `IconPort` as `MockBridge` (shared singleton), so the
	// GitHub Pages demo renders icons declaratively without Obsidian.
	createIconPort(): IconPort {
		return staticIconPort;
	}

	// ── Provider history factory (SPEC-TS-008, ADR-TS-001 §3) ───────────────────
	// Returns a fresh fixture-seeded in-memory store so the GitHub Pages demo shows
	// a populated history list. Writes are non-durable (re-seeds per mount) — the
	// correct posture for a stateless public demo (NFR-TS-002).
	createProviderHistoryPort(): ProviderHistoryPort {
		return new FixtureHistoryStore();
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
	// Console is the only output channel available in a browser-only bridge.
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
}
