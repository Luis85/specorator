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
}
