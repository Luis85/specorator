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
	/**
	 * Anthropic API key. Written to process.env.ANTHROPIC_API_KEY at plugin load time
	 * and used solely to initialise ClaudeCliAdapter. Never written to any vault file.
	 * Never logged. Stored in the plugin data blob (Obsidian's this.saveData()).
	 *
	 * Security note: Obsidian Sync will include this key if the user has Sync enabled.
	 * A notice in the settings tab informs users of this (REQ-CCS-001, C.7).
	 *
	 * Satisfies REQ-CCS-001, REQ-CCS-002, NFR-CCS-005, NFR-CCS-006.
	 */
	readonly anthropicApiKey: string
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
	anthropicApiKey: '',
}
