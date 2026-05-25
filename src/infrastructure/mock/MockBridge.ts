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
} from '@/domain/ports';
import { type PluginSettings, DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings';
import { MockChatRuntime } from './MockChatRuntime';
import { MockHistoryStore } from './MockHistoryStore';
import {
	MockMentionDataProvider,
	MockProviderCommandCatalog,
	MockShellExec,
} from './MockComposerPorts';
import { MockAuxModel } from './MockAuxModel';
import { MockSelectionSource, MockSelectionHighlight } from './MockSelectionPorts';
import { MockToolbarCatalog } from './MockToolbarCatalog';
import type { MentionDataProviderPort, ShellExecResult } from '@/domain/ports';
import { safeMarkdownRenderPort } from '@/application/chat/safeMarkdownRenderPort';
import { staticIconPort } from '@/infrastructure/icons/staticIconPort';

function folderPrefix(parent: string): string {
	if (parent === '') return '';
	return parent.endsWith('/') ? parent : `${parent}/`;
}

/**
 * In-memory bridge used in standalone dev mode and unit tests. P0 reboot:
 * implements only the six core ports (the chat/icon members were removed with
 * their subsystems). Provides test helpers for inspecting state.
 */
export class MockBridge
	implements
		SettingsPort,
		VaultPort,
		WorkspacePort,
		NotificationPort,
		LoggerPort,
		CommunityPluginPort
{
	private readonly files = new Map<string, string>();
	private readonly binaries = new Map<string, Uint8Array>();
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
	private vaultBasePath: string | null;
	/** Stable in-memory history store for the mount (SPEC-TS-007). Lazily created. */
	private historyStore: MockHistoryStore | null = null;
	/** Scripted-echo ShellExec for the mount (SPEC-CP-009). Stateless — the bridge is the port. */
	private readonly shellExecPort = new MockShellExec();
	/** Scriptable one-shot aux model (SPEC-CA-008). Stateless — the bridge exposes the port. */
	private readonly auxModelPort = new MockAuxModel();
	/** Inert-but-scriptable selection source (SPEC-CA-008 selection leg). */
	private readonly selectionSourcePort = new MockSelectionSource();
	/** Recording no-op selection highlight (SPEC-CA-008 selection leg). */
	private readonly selectionHighlightPort = new MockSelectionHighlight();
	/** Scriptable toolbar catalog (SPEC-TC-008). Stateless — the bridge exposes the port. */
	private readonly toolbarCatalogPort = new MockToolbarCatalog();

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

	// P5 SPEC-CA-006/008 — in-memory byte read. Seed bytes with `seedBinary`; a
	// missing path REJECTS (the `Result.err` path `AddImageUseCase` wraps in
	// `tryAsync`, T-CA-023). Returns a defensive copy so callers cannot mutate
	// the seeded buffer.
	async readBinary(path: string): Promise<Uint8Array> {
		const bytes = this.binaries.get(path);
		if (bytes === undefined) throw new Error(`[MockBridge] File not found: ${path}`);
		return new Uint8Array(bytes);
	}

	async writeFile(path: string, content: string): Promise<void> {
		this.files.set(path, content);
	}

	async deleteFile(path: string): Promise<void> {
		this.files.delete(path);
	}

	async listFiles(folder: string): Promise<string[]> {
		// Root listing: top-level files have no `/` in their path.
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
	}

	// ── Chat runtime factory (SPEC-CC-013, ADR-CC-001 §6) ───────────────────────
	// Returns a fresh per-conversation `MockChatRuntime` (scripted, no subprocess)
	// so `npm run dev` and unit tests get a working chat. Each call is a new
	// instance for per-conversation state isolation.
	createChatRuntime(): ChatRuntimePort {
		return new MockChatRuntime();
	}

	// ── Markdown render port (SPEC-CC-013, SPEC-CC-015, ADR-RR-002) ─────────────
	// The pure `safeMarkdownRender`-backed port (structured nodes, no HTML sink).
	// Per ADR-RR-002 the port is async: this stateless singleton resolves
	// `Promise.resolve(safeMarkdownRender(markdown))` (the pure transform stays
	// synchronous). Obsidian's awaited `MarkdownRenderer` backing is the production
	// path; Mock/LocalStorage share this resolved-pure-baseline backing.
	createMarkdownRenderPort(): MarkdownRenderPort {
		return safeMarkdownRenderPort;
	}

	// ── Icon port factory (SPEC-RR-012, ADR-RR-001 §4) ──────────────────────────
	// The static-map `IconPort` (declarative `IconNode`s, no DOM sink). Shared
	// with `LocalStorageBridge` so `npm run dev` and the demo render icons
	// without Obsidian; the Obsidian `setIcon` walk is the parity truth (P2).
	createIconPort(): IconPort {
		return staticIconPort;
	}

	// ── Provider history factory (SPEC-TS-007, ADR-TS-001 §3) ───────────────────
	// Returns the mount's stable in-memory `MockHistoryStore` (over a `Map`, no
	// vault), so `npm run dev` and unit tests exercise the full history flow. The
	// concrete type exposes `seedConversations`/`getAllConversations` test helpers.
	createProviderHistoryPort(): MockHistoryStore {
		this.historyStore ??= new MockHistoryStore();
		return this.historyStore;
	}

	// ── Composer-power ports (SPEC-CP-009, ADR-CP-002 §4) ───────────────────────
	// Mention/catalog are per-mount FACTORIES (parity with the Obsidian impls);
	// ShellExec is stateless — the bridge IS the port (no factory).

	/** Fixture mention provider (files + one subagent; MCP []). */
	createMentionDataProvider(): MentionDataProviderPort {
		return new MockMentionDataProvider();
	}

	/** Fixture command/skill catalog with a `seedCatalogDelay` test hook. */
	createProviderCommandCatalog(): MockProviderCommandCatalog {
		return new MockProviderCommandCatalog();
	}

	/** Scripted-echo `ShellExecPort` (never spawns a process, S1). */
	get shellExec(): MockShellExec {
		return this.shellExecPort;
	}

	/** Test helper: script the ShellExec result for an exact command string. */
	seedShellExec(command: string, result: ShellExecResult): void {
		this.shellExecPort.seed(command, result);
	}

	// ── Aux model port (SPEC-CA-008, ADR-CA-002 §1) ─────────────────────────────
	// The one-shot cold-start aux seam the re-pointed title/refine use cases drive.
	// Scriptable (setAuxResponse/setAuxError/setAuxEmpty); stateless — the bridge IS
	// the port (no factory; per-conversation isolation is not needed for a one-shot).

	/** Scriptable one-shot `AuxModelPort` (no subprocess; never throws). */
	get auxModel(): MockAuxModel {
		return this.auxModelPort;
	}

	// ── Selection ports (SPEC-CA-008 selection leg, ADR-CA-003 §1) ──────────────
	// Capture (scriptable, inert by default) + paint (recording no-op). The real
	// CM6 + canvas poll + decoration is the Obsidian leg (T-CA-014).

	/** Inert-but-scriptable `SelectionSourcePort` (`setSelection` drives capture). */
	get selectionSource(): MockSelectionSource {
		return this.selectionSourcePort;
	}

	/** Recording no-op `SelectionHighlightPort` (`show`/`clear` recorded for assertion). */
	get selectionHighlight(): MockSelectionHighlight {
		return this.selectionHighlightPort;
	}

	// ── Toolbar catalog port (SPEC-TC-008, ADR-TC-004 §1) ───────────────────────
	// The scriptable option-list + descriptor source the toolbar view-model reads.
	// Scriptable (setToolbarCatalog); stateless — the bridge IS the port (no factory;
	// the catalog is a per-mount constant in P6).

	/** Scriptable `ToolbarCatalogPort` (`setToolbarCatalog` drives the catalog; never throws). */
	get toolbarCatalog(): MockToolbarCatalog {
		return this.toolbarCatalogPort;
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
	 * Test-facing accessor for the captured notice log. Returns a defensive copy.
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

	/** Test helper: seed raw bytes for `readBinary` (SPEC-CA-008 readBinary leg). */
	seedBinary(path: string, bytes: Uint8Array): void {
		this.binaries.set(path, new Uint8Array(bytes));
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
