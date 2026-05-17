import type { TransportKind } from '@/domain/chat/TransportKind'

/**
 * Domain-level plugin configuration. Persisted via SettingsPort and
 * read by use cases that need to resolve vault paths or behaviour flags.
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
	 * Chat transport selection mode. `'auto'` applies the REQ-ASM-002 precedence
	 * (API key → subscription/CLI → degraded). Explicit values force a specific
	 * transport. Per SPEC-ASM-001 §2.12, REQ-ASM-002.
	 */
	readonly transportKind: TransportKind
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
	transportKind: 'auto',
}
