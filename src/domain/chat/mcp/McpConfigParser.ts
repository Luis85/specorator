/**
 * The PURE, TOTAL MCP config parser (P8, SPEC-MC-004/029). Ported verbatim from
 * claudian `core/mcp/McpConfigParser.ts:17` + `core/types/mcp.ts:74/81`, with the
 * Claudian throw paths converted to `Result.err` (ADR-004). No class, no `obsidian`,
 * no `node:*`, no I/O, no `eval` — JSON parse only (NFR-MC-003/004). Every function
 * returns a value for any input and NEVER throws.
 */
import type { Result } from '@/domain/shared/Result';
import { ok, err } from '@/domain/shared/Result';
import { trySync } from '@/domain/shared/tryAsync';
import type { McpServerConfig, McpServerType, ParsedMcpConfig } from './McpTypes';

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Classify a config by transport (REQ-MC-005). `type:'sse'`→sse; `type:'http'`→http;
 * a bare `url` (no explicit type)→http; else (a command)→stdio. Total.
 */
export function getMcpServerType(config: McpServerConfig): McpServerType {
	// Total: a non-object input cannot match a transport (NFR-MC-004); the typed
	// surface only ever passes a real config, so this guards odd runtime input.
	if (!isRecord(config)) return 'stdio';
	if (config.type === 'sse') return 'sse';
	if (config.type === 'http') return 'http';
	if ('url' in config) return 'http';
	return 'stdio';
}

/**
 * Validate a single candidate (REQ-MC-006). True iff a non-empty string `command`
 * (stdio) OR a non-empty string `url` (sse/http). Total.
 */
export function isValidMcpServerConfig(obj: unknown): obj is McpServerConfig {
	if (!isRecord(obj)) return false;
	const config = obj;
	if (typeof config.command === 'string' && config.command.length > 0) return true;
	if (typeof config.url === 'string' && config.url.length > 0) return true;
	return false;
}

/**
 * Parse a pasted config string (REQ-MC-003/004), accepting the four Claudian
 * formats (SPEC-MC-029) and returning `{ servers, needsName }`:
 *  1. `{ mcpServers: { name: config } }` → `needsName:false`.
 *  2. a single un-named valid config → `needsName:true`.
 *  3. a single `{ name: config }` → `needsName:false`.
 *  4. multiple `{ name: config, … }` → `needsName:false`.
 * Invalid JSON → `err('Invalid JSON')`; a non-object / array / no-server object →
 * `err('Invalid MCP configuration format')`. Total — never throws, never corrupts.
 */
export function parseClipboardConfig(raw: string): Result<ParsedMcpConfig> {
	const parsedResult = trySync<unknown>(() => JSON.parse(raw));
	if (!parsedResult.ok) {
		return err(new Error('Invalid JSON'));
	}
	const parsed = parsedResult.value;

	if (!isRecord(parsed)) {
		return err(new Error('Invalid MCP configuration format'));
	}

	// Format 1: full Claude Code format { "mcpServers": { "name": {...} } }.
	if (isRecord(parsed.mcpServers)) {
		const servers = collectValidEntries(parsed.mcpServers);
		if (servers.length === 0) {
			return err(new Error('No valid server configs found in mcpServers'));
		}
		return ok({ servers, needsName: false });
	}

	// Format 2: a single un-named server config.
	if (isValidMcpServerConfig(parsed)) {
		return ok({ servers: [{ name: '', config: parsed }], needsName: true });
	}

	// Format 3: a single named server.
	const entries = Object.entries(parsed);
	if (entries.length === 1) {
		const [name, config] = entries[0];
		if (isValidMcpServerConfig(config)) {
			return ok({ servers: [{ name, config }], needsName: false });
		}
	}

	// Format 4: multiple named servers (no mcpServers wrapper).
	const servers = collectValidEntries(parsed);
	if (servers.length > 0) {
		return ok({ servers, needsName: false });
	}

	return err(new Error('Invalid MCP configuration format'));
}

function collectValidEntries(
	record: Record<string, unknown>,
): Array<{ name: string; config: McpServerConfig }> {
	const servers: Array<{ name: string; config: McpServerConfig }> = [];
	for (const [name, config] of Object.entries(record)) {
		if (isValidMcpServerConfig(config)) {
			servers.push({ name, config });
		}
	}
	return servers;
}
