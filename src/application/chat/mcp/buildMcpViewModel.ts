/**
 * The PURE, TOTAL MCP selector + settings view-model (P8, SPEC-MC-014, ADR-MC-003 §3).
 * Derives the DTO view-model from the managed list + the `supportsMcpTools`
 * capability: the P6 visible-empty seam at 0 servers, the live list at ≥ 1. DTO only
 * — no domain instance crosses the store boundary (NFR-MC-005). No class, no
 * `obsidian`, no `node:*`, no Vue, no `providerId` branch. Never throws.
 */
import type { ManagedMcpServer, McpServerType } from '@/domain/chat/mcp/McpTypes';
import { getMcpServerType } from '@/domain/chat/mcp/McpConfigParser';

/** One server row for the settings list + the selector (DTO, NFR-MC-005). */
export interface McpServerVm {
	readonly name: string;
	readonly type: McpServerType;
	readonly enabled: boolean;
	readonly description?: string;
}

/** The MCP view-model: the P6 empty seam at 0 servers, the live list at ≥ 1 (REQ-MC-082/050). */
export interface McpViewModel {
	/** `'empty-seam'` ⇒ the P6 "coming later" panel (REQ-MC-082); `'live'` ⇒ ≥ 1 server. */
	readonly kind: 'empty-seam' | 'live';
	/** The server rows; `[]` when `empty-seam`. */
	readonly servers: readonly McpServerVm[];
	/** The selector badge count (REQ-MC-015/050). */
	readonly enabledCount: number;
	/** `ToolbarCapabilities.supportsMcpTools` — the settings + selector hide when false (REQ-MC-041). */
	readonly supported: boolean;
}

/**
 * Build the MCP view-model from the managed list + the capability (REQ-MC-015/040/
 * 050/082). Pure + total.
 */
export function buildMcpViewModel(
	servers: readonly ManagedMcpServer[],
	supportsMcpTools: boolean,
): McpViewModel {
	const rows: McpServerVm[] = servers.map((server) => ({
		name: server.name,
		type: getMcpServerType(server.config),
		enabled: server.enabled,
		description: server.description,
	}));
	const enabledCount = servers.reduce((count, server) => (server.enabled ? count + 1 : count), 0);
	return {
		kind: rows.length === 0 ? 'empty-seam' : 'live',
		servers: rows,
		enabledCount,
		supported: supportsMcpTools,
	};
}
