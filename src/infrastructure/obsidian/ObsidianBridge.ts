import {
	Component,
	FileSystemAdapter,
	Notice,
	TFile,
	TFolder,
	normalizePath,
	setIcon,
	type App,
} from 'obsidian';
import {
	DEFAULT_SETTINGS,
	resolveSessionsFolder,
	clampMaxTabs,
	coerceActiveProvider,
	coerceEnabledProviders,
	coerceHomeFsConsent,
	type PluginSettings,
} from '@/domain/settings/PluginSettings';
import { trySync, tryAsync } from '@/domain/shared/tryAsync';
import type {
	SettingsPort,
	VaultPort,
	WorkspacePort,
	NotificationPort,
	LoggerPort,
	CommunityPluginPort,
	ChatRuntimePort,
	MarkdownRenderPort,
	SafeRenderResult,
	IconPort,
	IconNode,
	ProviderHistoryPort,
	MentionDataProviderPort,
	ProviderCommandCatalogPort,
	ShellExecPort,
	AuxModelPort,
	AuxModelRunOptions,
	SelectionSourcePort,
	SelectionHighlightPort,
	ToolbarCatalogPort,
	ApprovalRuleStorePort,
	McpConfigStorePort,
	McpClientPort,
	ProviderRegistryPort,
	SecretStorePort,
	HomeFsPort,
} from '@/domain/ports';
import type { Result } from '@/domain/shared/Result';
import { ok, err } from '@/domain/shared/Result';
import type { StreamChunk } from '@/domain/chat/StreamChunk';
import { MarkdownRenderer } from 'obsidian';
import { ClaudeCliChatRuntime } from './ClaudeCliChatRuntime';
import { ObsidianMentionDataProvider } from './ObsidianMentionDataProvider';
import { ObsidianProviderCommandCatalog } from './ObsidianProviderCommandCatalog';
import { ObsidianShellExec } from './ObsidianShellExec';
import { ObsidianSelectionSource, ObsidianSelectionHighlight } from './ObsidianSelectionPorts';
import { ObsidianToolbarCatalog } from './ObsidianToolbarCatalog';
import { ObsidianApprovalRuleStore } from './ObsidianApprovalRuleStore';
import { VaultMcpConfigStore } from './VaultMcpConfigStore';
import { SdkMcpClient } from './SdkMcpClient';
import { ProviderRegistry } from '@/infrastructure/providers/ProviderRegistry';
import { SecretStorage } from './SecretStorage';
import { HomeFileSystem } from './HomeFileSystem';
import { ObsidianProviderRuntimeRegistry } from './ObsidianProviderRuntimeRegistry';
import { VaultFileHistoryStore } from './history/VaultFileHistoryStore';
import { safeMarkdownRender } from '@/application/chat/safeMarkdownRender';
import { walkSvgElementToIconNode } from './walkSvgElementToIconNode';
import { walkMarkdownFragment } from './walkMarkdownFragment';

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

	/** Lifecycle owner for `MarkdownRenderer.render` post-processors (SPEC-RR-010). */
	private readonly _renderComponent = new Component();

	/** Stable device-local key for the user/device-scoped settings blob (ADR-PSR-002). */
	private static readonly _SETTINGS_KEY = 'specorator:settings';

	constructor(private readonly app: App) {}

	async readFile(path: string): Promise<string> {
		const normalized = normalizePath(path);
		const file = this.app.vault.getAbstractFileByPath(normalized);
		if (!(file instanceof TFile)) throw new Error(`File not found: ${normalized}`);
		return this.app.vault.read(file);
	}

	// P5 SPEC-CA-006/007 — real vault byte read (coverage-excluded, manual leg
	// TEST-CA-M3). Reads the file's raw bytes via `vault.readBinary` and wraps the
	// `ArrayBuffer` in a `Uint8Array`; a missing file rejects (the caller —
	// `AddImageUseCase` — wraps it in `tryAsync` → `Result.err`).
	async readBinary(path: string): Promise<Uint8Array> {
		const normalized = normalizePath(path);
		const file = this.app.vault.getAbstractFileByPath(normalized);
		if (!(file instanceof TFile)) throw new Error(`File not found: ${normalized}`);
		const buffer = await this.app.vault.readBinary(file);
		return new Uint8Array(buffer);
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

	// ── Provider registry / runtime / secret / home-fs ports (SPEC-PV-009) ──────
	// The shared descriptor-table registry (coverage-included pure data) + the
	// coverage-excluded runtime registry (Claude reuse / Codex JSON-RPC / Opencode
	// ACP, the widened factory body) + the real `app.secretStorage` `SecretStorePort`
	// (NEVER `data.json`) + the real `node:fs` `HomeFsPort` (root-scoped,
	// path-escape→err). The wire-in batch routes the per-tab factory through
	// `providerRuntimeRegistry.createChatRuntime(providerId)`. Lazily constructed.
	private providerRegistryPort: ProviderRegistry | null = null;
	private secretStorePort: SecretStorage | null = null;
	private homeFsPortRef: HomeFileSystem | null = null;
	private providerRuntimeRegistryRef: ObsidianProviderRuntimeRegistry | null = null;

	/** The shared descriptor-table `ProviderRegistryPort` (SPEC-PV-008/009). */
	get providerRegistry(): ProviderRegistryPort {
		this.providerRegistryPort ??= new ProviderRegistry();
		return this.providerRegistryPort;
	}

	/** The real `app.secretStorage` `SecretStorePort` (NEVER `data.json`, ADR-PV-002). */
	get secretStore(): SecretStorePort {
		this.secretStorePort ??= new SecretStorage(this.app);
		return this.secretStorePort;
	}

	/** The real `node:fs` `HomeFsPort` rooted at `os.homedir()` (root-scoped, read-only). */
	get homeFs(): HomeFsPort {
		this.homeFsPortRef ??= new HomeFileSystem();
		return this.homeFsPortRef;
	}

	/**
	 * The runtime registry (`createChatRuntime(providerId): Result<ChatRuntimePort>`,
	 * the widened factory body): Claude reuse / Codex JSON-RPC / Opencode ACP, gated
	 * honestly on secret-store availability. Coverage-excluded; the manual legs
	 * TEST-PV-M1/M2/M3 are the behavioural gate.
	 */
	get providerRuntimeRegistry(): ObsidianProviderRuntimeRegistry {
		this.providerRuntimeRegistryRef ??= new ObsidianProviderRuntimeRegistry({
			secretStore: this.secretStore,
			homeFs: this.homeFs,
			cwd: this.getVaultBasePath(),
			logger: this,
		});
		return this.providerRuntimeRegistryRef;
	}

	// ── Aux model port (SPEC-CA-007 aux leg, ADR-CA-002 §1) ─────────────────────
	// The one-shot cold-start aux seam the title/refine/inline-edit consumers drive
	// (SPEC-CA-018/017). Builds a FRESH cold-start `ChatRuntimePort` (the same
	// factory the tabs use), drives `query(turn, [], { forceColdStart: true })`,
	// accumulates `text` chunks (tool/thinking/usage ignored), and maps a streaming
	// `error` chunk / an empty-accumulated result / an aborted `signal` →
	// `Result.err`; the non-empty text → `ok(text)`. The `signal` aborts the
	// subprocess via the runtime's `cancel()`. It NEVER resumes a session
	// (cold-start only, REQ-CA-021) and NEVER throws across the boundary
	// (`tryAsync`, NFR-CA-010). Coverage-excluded infra — behaviour gated by the
	// MANUAL leg TEST-CA-M1 (+ the real-CLI image turn TEST-CA-029). Each call is a
	// new runtime; no `obsidian` symbol leaks past this file.
	createAuxModel(): AuxModelPort {
		const createRuntime = (): ChatRuntimePort => this.createChatRuntime();
		return {
			run: (prompt: string, options?: AuxModelRunOptions): Promise<Result<string>> =>
				ObsidianBridge.runColdStartAux(createRuntime(), prompt, options),
		};
	}

	/** Drive one cold-start aux query and map error/empty/abort → `Result.err`. */
	private static async runColdStartAux(
		runtime: ChatRuntimePort,
		prompt: string,
		options?: AuxModelRunOptions,
	): Promise<Result<string>> {
		const signal = options?.signal;
		if (signal?.aborted === true) {
			return err(new Error('aux model query aborted'));
		}
		// A mutable holder (not a flow-narrowed `let`/`signal.aborted`) the abort
		// listener flips — the `signal` aborts the subprocess via `cancel()`.
		const state = { aborted: false };
		const onAbort = (): void => {
			state.aborted = true;
			runtime.cancel();
		};
		signal?.addEventListener('abort', onAbort);

		const sys = options?.systemPrompt;
		const framed = sys !== undefined && sys !== '' ? `${sys}\n\n${prompt}` : prompt;
		const prepared = runtime.prepareTurn({ text: framed });
		const drained = await tryAsync(() =>
			ObsidianBridge.drainAuxStream(runtime.query(prepared, [], { forceColdStart: true })),
		);

		signal?.removeEventListener('abort', onAbort);
		return ObsidianBridge.mapAuxOutcome(drained, state.aborted);
	}

	/** Map the drained cold-start outcome → `Result` (error/empty/abort → err). */
	private static mapAuxOutcome(
		drained: Result<{ text: string; errored: boolean }>,
		aborted: boolean,
	): Result<string> {
		if (!drained.ok) return err(drained.error);
		if (aborted) return err(new Error('aux model query aborted'));
		const { text, errored } = drained.value;
		if (errored) return err(new Error('aux model query failed'));
		if (text.trim() === '') return err(new Error('aux model returned no usable text'));
		return ok(text);
	}

	/** Accumulate `text` chunks from a cold-start aux stream; `done` terminates. */
	private static async drainAuxStream(
		stream: AsyncGenerator<StreamChunk>,
	): Promise<{ text: string; errored: boolean }> {
		let text = '';
		let errored = false;
		for await (const chunk of stream) {
			if (chunk.type === 'text') {
				text += chunk.content;
			} else if (chunk.type === 'error') {
				errored = true;
			} else if (chunk.type === 'done') {
				break;
			}
			// tool/thinking/usage and any other member are ignored for an aux query.
		}
		return { text, errored };
	}

	// ── Markdown render port (SPEC-CC-013/015, SPEC-RR-010, ADR-RR-002) ─────────
	// P2 re-backs the UNCHANGED `SafeRenderResult` DTO shape with Obsidian's
	// `MarkdownRenderer.render`: `await` the real (asynchronous) renderer into a
	// DETACHED element, THEN walk the now-populated fragment into the declarative
	// DTO entirely in the bridge, then discard the element — no DOM element / HTML
	// string / sink reaches the UI (NFR-RR-006). The port is async (ADR-RR-002 —
	// supersedes ADR-RR-001 §3) precisely because the renderer is async; the prior
	// sync read raced the renderer and always saw an empty fragment, so production
	// markdown rendered plain. Total: any internal failure (or an empty fragment)
	// degrades to the pure `safeMarkdownRender` baseline and NEVER rejects.
	// Coverage-excluded infra; behaviour gated by the MANUAL leg of TEST-RR-043.
	createMarkdownRenderPort(): MarkdownRenderPort {
		const app = this.app;
		const component = this._renderComponent;
		return {
			render: async (markdown: string): Promise<SafeRenderResult> => {
				const detached = createDiv();
				try {
					await MarkdownRenderer.render(app, markdown, detached, '', component);
					const walked = walkMarkdownFragment(detached);
					return walked.nodes.length > 0 ? walked : safeMarkdownRender(markdown);
				} catch {
					return safeMarkdownRender(markdown);
				} finally {
					detached.detach();
				}
			},
		};
	}

	// ── Icon port factory (SPEC-RR-012, ADR-RR-001 §4) ──────────────────────────
	// Calls Obsidian `setIcon` into a DETACHED element, walks the produced `<svg>`
	// subtree into a declarative `IconNode` (tag/attrs/children read as data), then
	// discards the element — NO DOM element / HTML string / sink reaches the UI
	// (NFR-RR-006). An unknown name produces no `<svg>` → `null` (the caller falls
	// back to a generic icon, REQ-RR-019). Coverage-excluded infra; behaviour gated
	// by the MANUAL leg of TEST-RR-026 (T-RR-043).
	createIconPort(): IconPort {
		return {
			setIcon: (name: string): IconNode | null => {
				const detached = createDiv();
				try {
					setIcon(detached, name);
					const svg = detached.querySelector('svg');
					return svg !== null ? walkSvgElementToIconNode(svg) : null;
				} finally {
					detached.detach();
				}
			},
		};
	}

	// ── Provider history factory (SPEC-TS-006, ADR-TS-001 §1/§3) ────────────────
	// Returns a vault-file `VaultFileHistoryStore` (one JSON file per conversation
	// under the resolved sessions folder). Passes `this` as the VaultPort + the
	// LoggerPort (corrupt-skip warn, no message content) and a folder resolver that
	// reads the device-local `sessionsFolder` setting. Coverage-excluded infra —
	// behaviour gated by the MANUAL leg TEST-TS-M1.
	createProviderHistoryPort(): ProviderHistoryPort {
		return new VaultFileHistoryStore(
			this,
			async () => (await this.getSettings()).sessionsFolder,
			this,
		);
	}

	// ── Composer-power ports (SPEC-CP-007, ADR-CP-002 §4) ───────────────────────
	// Mention/catalog are per-mount factories (the Claude impl binds to the active
	// provider context). All vault I/O flows through this bridge's VaultPort — the
	// UI never imports obsidian (REQ-CP-010). Coverage-excluded infra; behaviour
	// gated by the manual leg TEST-CP-M1.

	createMentionDataProvider(): MentionDataProviderPort {
		return new ObsidianMentionDataProvider(this);
	}

	createProviderCommandCatalog(): ProviderCommandCatalogPort {
		return new ObsidianProviderCommandCatalog(this);
	}

	// ── Bang-bash ShellExec (SPEC-CP-008, ADR-CP-002 §3) ────────────────────────
	// Stateless — the bridge IS the port (no factory). The sole real shell path
	// (S1); cwd = the vault adapter base path; passes `this` as the LoggerPort so
	// only the command + exit code are logged (S3, never stdout/stderr content).
	// Lazily created; coverage-excluded infra (manual leg TEST-CP-M2).
	private shellExecPort: ShellExecPort | null = null;

	get shellExec(): ShellExecPort {
		this.shellExecPort ??= new ObsidianShellExec(() => this.getVaultBasePath(), this);
		return this.shellExecPort;
	}

	// ── Selection ports (SPEC-CA-007, ADR-CA-003 §1) ────────────────────────────
	// CM6 editor + Obsidian canvas selection capture (250 ms poll, transient
	// errors swallowed → null) and the CM6 highlight decoration. Lazily created;
	// coverage-excluded infra (manual legs TEST-CA-M1/M3 + TEST-CA-017). No
	// `obsidian`/CM6 symbol leaks past `ObsidianSelectionPorts.ts`.
	private selectionSourcePort: SelectionSourcePort | null = null;
	private selectionHighlightPort: SelectionHighlightPort | null = null;

	get selectionSource(): SelectionSourcePort {
		this.selectionSourcePort ??= new ObsidianSelectionSource(this.app);
		return this.selectionSourcePort;
	}

	get selectionHighlight(): SelectionHighlightPort {
		this.selectionHighlightPort ??= new ObsidianSelectionHighlight(this.app);
		return this.selectionHighlightPort;
	}

	// ── Toolbar catalog port (SPEC-TC-007, ADR-TC-004 §1) ───────────────────────
	// The real static-for-now Claude catalog (model list + mode + effort descriptors,
	// no service-tier). Stateless — the bridge IS the port. Lazily created;
	// coverage-excluded infra (manual leg TEST-TC-M1). No `obsidian` symbol leaks past
	// `ObsidianToolbarCatalog.ts` (it imports only domain types).
	private toolbarCatalogPort: ToolbarCatalogPort | null = null;

	get toolbarCatalog(): ToolbarCatalogPort {
		this.toolbarCatalogPort ??= new ObsidianToolbarCatalog();
		return this.toolbarCatalogPort;
	}

	// ── Approval-rule store port (SPEC-AS-007, ADR-AS-001 §4) ───────────────────
	// The real device-local approval-rule store under `'specorator:approval-rules'`
	// (`app.saveLocalStorage`/`loadLocalStorage`), mirroring the `SettingsPort`
	// device-local pattern — NEVER `data.json`, NEVER a vault file (NFR-AS-003).
	// Lazily created; coverage-excluded infra (manual leg TEST-AS-M1). No `obsidian`
	// symbol leaks past `ObsidianApprovalRuleStore.ts` (it imports only the `App` type).
	private approvalRuleStorePort: ApprovalRuleStorePort | null = null;

	get approvalRuleStore(): ApprovalRuleStorePort {
		this.approvalRuleStorePort ??= new ObsidianApprovalRuleStore(this.app);
		return this.approvalRuleStorePort;
	}

	// ── MCP config store + client ports (SPEC-MC-009, ADR-MC-001/002) ───────────
	// The real vault `.claude/mcp.json` round-trip (via the pure codec over the
	// VaultPort — NEVER `data.json`, NEVER device-local, the single seam diverging
	// from the device-local precedent because the Claude CLI must read it) + the
	// real SDK stdio/SSE/HTTP transports over `@modelcontextprotocol/sdk` (the only
	// place the SDK is imported). Lazily created; coverage-excluded infra (manual
	// legs TEST-MC-M1 + TEST-MC-021/022/061/064). No `obsidian`/SDK/`node:*` symbol
	// leaks past `VaultMcpConfigStore.ts` / `SdkMcpClient.ts`.
	private mcpConfigStorePort: McpConfigStorePort | null = null;
	private mcpClientPort: McpClientPort | null = null;

	get mcpConfigStore(): McpConfigStorePort {
		this.mcpConfigStorePort ??= new VaultMcpConfigStore(this);
		return this.mcpConfigStorePort;
	}

	get mcpClient(): McpClientPort {
		this.mcpClientPort ??= new SdkMcpClient();
		return this.mcpClientPort;
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
		return ObsidianBridge._coerceSettings(parsed.value);
	}

	/**
	 * Field-level load-or-default coercion for the device-local blob. The two P3
	 * additive fields (SPEC-TS-005) flow through the pure resolve/clamp helpers so
	 * an absent/garbage value never escapes.
	 */
	private static _coerceSettings(
		obj: Partial<Record<keyof PluginSettings, unknown>>,
	): PluginSettings {
		const levels = ['debug', 'info', 'warn', 'error'] as const;
		const locale =
			typeof obj.locale === 'string' && obj.locale.trim() ? obj.locale : DEFAULT_SETTINGS.locale;
		const rawLevel = obj.logLevel;
		const logLevel =
			typeof rawLevel === 'string' && (levels as readonly string[]).includes(rawLevel)
				? (rawLevel as PluginSettings['logLevel'])
				: DEFAULT_SETTINGS.logLevel;
		const sessionsFolder = resolveSessionsFolder(
			typeof obj.sessionsFolder === 'string' ? obj.sessionsFolder : '',
		);
		const maxTabs = clampMaxTabs(typeof obj.maxTabs === 'number' ? obj.maxTabs : Number.NaN);
		// P4 (SPEC-CP-005): load-or-default the device-local custom system prompt.
		const customSystemPrompt =
			typeof obj.customSystemPrompt === 'string'
				? obj.customSystemPrompt
				: DEFAULT_SETTINGS.customSystemPrompt;
		// P9 (SPEC-PV-001/027): the device-local provider selection. Load-or-default
		// through the pure coercers — never a secret, no migration (ADR-PV-002).
		const activeProvider = coerceActiveProvider(obj.activeProvider);
		const enabledProviders = coerceEnabledProviders(obj.enabledProviders);
		// P9 (SPEC-PV-014/024, REQ-PV-082): the one-time beyond-vault consent record.
		// MUST round-trip so a recorded consent survives a production reload (the gate
		// never re-prompts, EC-PV-6). OPTIONAL — absent (`undefined`) when nothing was
		// recorded so the exact-key contract stays byte-identical P0–P8 (NFR-PV-001).
		const homeFsConsent = coerceHomeFsConsent(obj.homeFsConsent);
		return {
			locale,
			logLevel,
			sessionsFolder,
			maxTabs,
			customSystemPrompt,
			activeProvider,
			enabledProviders,
			...(homeFsConsent !== undefined ? { homeFsConsent } : {}),
		};
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
