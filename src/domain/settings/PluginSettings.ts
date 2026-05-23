import type { TransportKind } from '@/domain/chat/TransportKind'
import type {
	ProviderId,
	ProviderSelection,
} from '@/domain/chat/ProviderSelection'

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
	// `transportKind` intentionally omitted from defaults — the field is
	// migration input only (see deprecation note above).
	providerSelection: { forced: 'auto' },
	cursorCliPath: '',
	cursorApiPreview: false,
	autoPreferProvider: 'claude',
	providerModel: { claude: 'claude-sonnet-4', cursor: 'cursor-default' },
	chatTabCap: 10,
}
