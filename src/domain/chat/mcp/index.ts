/**
 * Barrel for the MCP domain slice (P8, SPEC-MC-001..006). Pure types + pure
 * functions only — no class, no `obsidian`, no `node:*`, no I/O.
 */
export type {
	McpStdioServerConfig,
	McpSseServerConfig,
	McpHttpServerConfig,
	McpServerConfig,
	McpServerType,
	ManagedMcpServer,
	McpTool,
	McpTestResult,
	ParsedMcpConfig,
	EnabledMcpServers,
} from './McpTypes';
export { DEFAULT_MCP_SERVER } from './McpTypes';
export {
	parseClipboardConfig,
	getMcpServerType,
	isValidMcpServerConfig,
} from './McpConfigParser';
export { deserializeMcpConfig, serializeMcpConfig } from './McpConfigCodec';
