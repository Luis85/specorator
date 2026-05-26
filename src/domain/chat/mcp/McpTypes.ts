/**
 * MCP (Model Context Protocol) type definitions (P8, SPEC-MC-001). Regrown
 * verbatim from claudian `core/types/mcp.ts` (the config union, `ManagedMcpServer`,
 * `ParsedMcpConfig`, `DEFAULT_MCP_SERVER`) + `core/mcp/McpTester.ts:13-25`
 * (`McpTool`, `McpTestResult`). Pure data — `readonly` where it crosses the store
 * boundary (NFR-MC-005); no class, no `obsidian`, no `node:*`.
 */

/** Stdio server config (local command-line program). */
export interface McpStdioServerConfig {
	type?: 'stdio';
	command: string;
	args?: string[];
	env?: Record<string, string>;
}

/** Server-Sent-Events remote server config. */
export interface McpSseServerConfig {
	type: 'sse';
	url: string;
	headers?: Record<string, string>;
}

/** Streamable-HTTP remote server config. */
export interface McpHttpServerConfig {
	type: 'http';
	url: string;
	headers?: Record<string, string>;
}

export type McpServerConfig = McpStdioServerConfig | McpSseServerConfig | McpHttpServerConfig;
export type McpServerType = 'stdio' | 'sse' | 'http';

/** A managed server = a config + the `_claudian` sidecar metadata (parity ManagedMcpServer). */
export interface ManagedMcpServer {
	name: string;
	config: McpServerConfig;
	enabled: boolean;
	contextSaving: boolean;
	disabledTools?: string[];
	description?: string;
}

/** One MCP tool descriptor (parity McpTester.ts:13). */
export interface McpTool {
	name: string;
	description?: string;
	inputSchema?: Record<string, unknown>;
}

/** The structured test result — NEVER a throw (parity McpTester.ts:19; SPEC-MC-028). */
export interface McpTestResult {
	success: boolean;
	serverName?: string;
	serverVersion?: string;
	tools: McpTool[];
	error?: string;
}

/** The parse-clipboard result (parity ParsedMcpConfig). `needsName` true only for format 2. */
export interface ParsedMcpConfig {
	servers: ReadonlyArray<{ name: string; config: McpServerConfig }>;
	needsName: boolean;
}

/** The folded active set + disallowed tools threaded to a turn (ADR-MC-003 §1). */
export interface EnabledMcpServers {
	/** Active servers = enabled ∧ (¬contextSaving ∨ mentioned). */
	servers: Record<string, McpServerConfig>;
	/** `mcp__<server>__<tool>` ids for disabled tools (pre-registered disallow list). */
	disallowedTools: readonly string[];
}

/** Metadata defaults applied on load when the sidecar omits a field (parity DEFAULT_MCP_SERVER). */
export const DEFAULT_MCP_SERVER: { enabled: boolean; contextSaving: boolean } = {
	enabled: true,
	contextSaving: true,
};
