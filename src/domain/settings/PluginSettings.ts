import type { TransportKind } from '@/domain/chat/TransportKind'
import type {
	ProviderId,
	ProviderSelection,
} from '@/domain/chat/ProviderSelection'

/**
 * Full DevTools tool id alphabet governed by ADR-019. Mirrors the literal
 * union exported by `@/application/mcp/threatParagraphs`, redeclared here so
 * the settings domain owns its own canonical surface (the application module
 * carries the same shape independently per ADR-008 inward-only direction).
 */
export type DevToolsToolId =
	| 'dev:screenshot'
	| 'dev:errors'
	| 'dev:console'
	| 'dev:dom'
	| 'dev:cdp'
	| 'dev:debug'
	| 'dev:mobile'
	| 'devtools'

/**
 * The five high-risk DevTools tool ids governed by per-tool opt-in toggles
 * (REQ-MHP-017, ADR-019 Part 3). The three low-risk ids — `dev:screenshot`,
 * `dev:errors`, `dev:console` — are gated by the master toggle plus
 * `devtools.autoAcceptLowRisk` only; they have no per-tool toggle.
 */
export type DevToolsHighRiskToolId = Extract<
	DevToolsToolId,
	'dev:dom' | 'dev:cdp' | 'dev:debug' | 'dev:mobile' | 'devtools'
>

/**
 * DevTools opt-in matrix per ADR-019 + SPEC §"Settings additions".
 *
 * - `masterEnabled` (REQ-MHP-016): master toggle. When `false`, none of the
 *   eight DevTools tools register.
 * - `autoAcceptLowRisk` (REQ-MHP-043): when `true` AND `masterEnabled`,
 *   auto-accepts the three low-risk tools (`dev:screenshot`, `dev:errors`,
 *   `dev:console`). Has NO effect on the high-risk five — `dev:cdp` and the
 *   other high-risk tools always prompt (REQ-MHP-020).
 * - `tools[id].enabled` (REQ-MHP-017): per-tool opt-in for the high-risk five.
 *   Registration requires master enabled AND per-tool enabled.
 */
export interface DevToolsSettings {
	readonly masterEnabled: boolean
	readonly autoAcceptLowRisk: boolean
	readonly tools: Readonly<
		Record<DevToolsHighRiskToolId, { readonly enabled: boolean }>
	>
}

/**
 * Domain-level plugin configuration. Persisted via SettingsPort and
 * read by use cases that need to resolve vault paths or behaviour flags.
 *
 * SPEC-MPS-001 §2.7 (WS-2): the v0.x `transportKind` field is replaced by
 * `providerSelection` plus five companion fields. `transportKind` survives
 * as a deprecated optional field on the type until WS-3 (T-MPS-029)
 * completes the selector reshape — it is migration input only and is not
 * carried through `DEFAULT_SETTINGS`.
 */
export interface PluginSettings {
	readonly locale: string
	readonly specsFolder: string
	readonly archiveFolder: string
	readonly decisionsFolder: string
	readonly constitutionFile: string
	readonly gateStrictness: 'strict' | 'lenient'
	readonly teamMode: boolean
	readonly logLevel: 'debug' | 'info' | 'warn' | 'error'
	/**
	 * Opt-in flag for the local MCP server (HTTP/SSE on 127.0.0.1).
	 * Default is `false` for privacy — the server is started only when the
	 * user explicitly enables it via Settings or runs the "Start MCP server"
	 * command. See README "MCP server (advanced, opt-in)".
	 */
	readonly mcpServerEnabled: boolean
	readonly userPersona: string
	readonly onboardingComplete: boolean
	/**
	 * Absolute filesystem path to the user's `claude` binary. Empty string = unset
	 * (auto-detect at runtime). Per SPEC-ASM-001 §2.12, REQ-ASM-004.
	 */
	readonly claudeCliPath: string
	/**
	 * Absolute filesystem path to the official `obsidian` CLI binary, or `''` for
	 * auto-detect/unset. Backs the ADR-018 CLI-backed MCP tool group. Mirrors
	 * `claudeCliPath`. Per SPEC-OCM-001 §7, REQ-OCM-016.
	 */
	readonly obsidianCliPath: string
	/**
	 * When `true` (default), the plugin writes a `.mcp.json` at the vault root
	 * whenever the loopback MCP server starts and deletes it on stop. This
	 * lets a `claude` CLI session launched from a terminal inside the vault
	 * pick up the same MCP server as the embedded sidepanel — `claude` reads
	 * `.mcp.json` from cwd as one of its standard config sources.
	 *
	 * Set to `false` if you manage `.mcp.json` yourself or do not want the
	 * plugin mutating vault-root files. The plugin only manages the file
	 * while the MCP server is running; the file is removed cleanly on stop
	 * or plugin unload.
	 */
	readonly writeProjectMcpConfig: boolean
	/**
	 * Legacy chat transport mode (`'auto' | 'api-key' | 'subscription' |
	 * 'degraded'`). Replaced by `providerSelection` in SPEC-MPS-001 §2.7;
	 * retained as a deprecated optional field so WS-3's selector reshape can
	 * still read it during the cross-workstream rollout. Migration
	 * (`migrateProviderSelection`) translates the legacy value into
	 * `providerSelection` and deletes the legacy key from `_storedData`.
	 *
	 * @deprecated Use `providerSelection`. Removed in WS-3 (T-MPS-029).
	 */
	readonly transportKind?: TransportKind
	/**
	 * Discriminated chat-provider selection. Replaces the v0.x flat
	 * `transportKind`. `{ forced: 'auto' }` defers to `selectTransport`'s
	 * precedence rules; `{ provider, mode }` forces a specific cell. Per
	 * SPEC-MPS-001 §2.7 / REQ-MPS-003.
	 */
	readonly providerSelection: ProviderSelection
	/**
	 * Absolute filesystem path to the user's `cursor-agent` binary, or `''`
	 * for auto-detect. Mirrors `claudeCliPath`. REQ-MPS-008 / REQ-MPS-025.
	 */
	readonly cursorCliPath: string
	/**
	 * Opt-in preview flag for the Cursor HTTP/SSE API adapter. Required for
	 * `selectTransport` to return Cursor API in `forced: 'auto'` resolution
	 * (REQ-MPS-014). Default `false` — Cursor API is not exposed unless the
	 * user explicitly opts in.
	 */
	readonly cursorApiPreview: boolean
	/**
	 * Which provider `forced: 'auto'` should prefer when both providers'
	 * API keys are present. Defaults to `'claude'`. Per REQ-MPS-008.
	 */
	readonly autoPreferProvider: ProviderId
	/**
	 * Per-provider model selection. Keys are `ProviderId`; values are the
	 * provider-specific model id. Default values cover the v1 launch
	 * baseline. Per REQ-MPS-040.
	 */
	readonly providerModel: Readonly<Record<ProviderId, string>>
	/**
	 * Maximum number of concurrent chat threads kept in memory before the
	 * thread switcher prunes the least-recently-used. Per REQ-MPS-040.
	 */
	readonly chatTabCap: number
	/**
	 * When `true`, every MCP write tool returns `pending` regardless of the
	 * active-feature-append auto-accept rule (REQ-MHP-010). Default `false`:
	 * appends inside `specs/<active>/*.md` may auto-accept per REQ-MHP-009.
	 */
	readonly requireExplicitAcceptForAllWrites: boolean
	/**
	 * DevTools opt-in matrix per ADR-019 (REQ-MHP-016, REQ-MHP-017,
	 * REQ-MHP-043). All three nested fields default to `false`; the registrar
	 * registers zero DevTools tools until the user explicitly opts in via the
	 * settings tab.
	 */
	readonly devtools: DevToolsSettings
}

export const DEFAULT_SETTINGS: PluginSettings = {
	locale: 'en',
	specsFolder: 'specs',
	archiveFolder: 'archive',
	decisionsFolder: 'decisions',
	constitutionFile: 'CONSTITUTION.md',
	gateStrictness: 'strict',
	teamMode: false,
	logLevel: 'warn',
	mcpServerEnabled: false,
	userPersona: '',
	onboardingComplete: false,
	claudeCliPath: '',
	obsidianCliPath: '',
	writeProjectMcpConfig: true,
	// `transportKind` intentionally omitted from defaults — the field is
	// migration input only (see deprecation note above).
	providerSelection: { forced: 'auto' },
	cursorCliPath: '',
	cursorApiPreview: false,
	autoPreferProvider: 'claude',
	providerModel: { claude: 'claude-sonnet-4', cursor: 'cursor-default' },
	chatTabCap: 10,
	requireExplicitAcceptForAllWrites: false,
	devtools: {
		masterEnabled: false,
		autoAcceptLowRisk: false,
		tools: {
			'dev:dom': { enabled: false },
			'dev:cdp': { enabled: false },
			'dev:debug': { enabled: false },
			'dev:mobile': { enabled: false },
			devtools: { enabled: false },
		},
	},
}
