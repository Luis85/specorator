/**
 * The PURE, TOTAL active-set + disallowed-tools folds (P8, SPEC-MC-006). Ported
 * from claudian `McpServerManager.getActiveServers:38` + `collectDisallowedTools` /
 * `getAllDisallowedMcpTools:74-94`. No class, no `obsidian`, no `node:*`, no I/O.
 * Never throws.
 */
import type { ManagedMcpServer, McpServerConfig } from './McpTypes';

/**
 * The active enabled servers for a turn (REQ-MC-052/053). A server is included iff
 * it is enabled AND (NOT `contextSaving` OR its name ∈ `mentionedNames`). In P8 the
 * surface ALWAYS passes `mentionedNames = ∅` (NG3) → a context-saving server is
 * excluded. Total — returns a fresh map, never throws.
 */
export function getActiveServers(
	servers: readonly ManagedMcpServer[],
	mentionedNames: ReadonlySet<string>,
): Record<string, McpServerConfig> {
	const result: Record<string, McpServerConfig> = {};

	for (const server of servers) {
		if (!server.enabled) continue;
		if (server.contextSaving && !mentionedNames.has(server.name)) continue;
		result[server.name] = server.config;
	}

	return result;
}

/**
 * The disallowed `mcp__<server>__<tool>` ids (REQ-MC-054). Pre-registers the
 * disabled tools of ALL enabled servers (ignoring `contextSaving`/mentions, parity
 * `getAllDisallowedMcpTools`) so a later mention does not force a cold start
 * (REQ-MC-053). Trimmed, de-duped, sorted. Total.
 */
export function collectDisallowedMcpTools(servers: readonly ManagedMcpServer[]): string[] {
	const disallowed = new Set<string>();

	for (const server of servers) {
		if (!server.enabled) continue;
		if (server.disabledTools === undefined || server.disabledTools.length === 0) continue;

		for (const tool of server.disabledTools) {
			const normalized = tool.trim();
			if (normalized === '') continue;
			disallowed.add(`mcp__${server.name}__${normalized}`);
		}
	}

	return Array.from(disallowed).sort();
}
