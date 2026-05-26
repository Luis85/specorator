/**
 * The PURE, TOTAL MCP config codec (P8, SPEC-MC-003) — string ⇄
 * `ManagedMcpServer[]`, no I/O, never throws (NFR-MC-004). Ported from claudian
 * `providers/claude/storage/McpStorage.load:14-56` + `save:58-134`; the bridge does
 * only the device-vault read/write, the codec is the round-trip authority. No class,
 * no `obsidian`, no `node:*`.
 */
import type { Result } from '@/domain/shared/Result';
import { ok } from '@/domain/shared/Result';
import { trySync } from '@/domain/shared/tryAsync';
import type { ManagedMcpServer, McpServerConfig } from './McpTypes';
import { DEFAULT_MCP_SERVER } from './McpTypes';
import { isValidMcpServerConfig } from './McpConfigParser';

/** The non-default sidecar metadata recorded per server under `_claudian.servers`. */
interface SidecarMeta {
	enabled?: boolean;
	contextSaving?: boolean;
	disabledTools?: string[];
	description?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Parse the `.claude/mcp.json` document text into a server list (REQ-MC-001/002).
 * Reads `mcpServers` + the `_claudian.servers` sidecar; applies `DEFAULT_MCP_SERVER`
 * defaults; skips entries failing `isValidMcpServerConfig`; an
 * absent/empty/unparseable/no-`mcpServers` doc ⇒ `ok([])` (load-or-default, no
 * migration). Total.
 */
export function deserializeMcpConfig(raw: string | null): Result<ManagedMcpServer[]> {
	if (raw === null || raw === '') return ok([]);

	const parsed = trySync<unknown>(() => JSON.parse(raw));
	if (!parsed.ok || !isRecord(parsed.value)) return ok([]);

	const file = parsed.value;
	if (!isRecord(file.mcpServers)) return ok([]);

	const claudianMeta = readSidecarServers(file);
	const servers: ManagedMcpServer[] = [];

	for (const [name, config] of Object.entries(file.mcpServers)) {
		if (!isValidMcpServerConfig(config)) continue;
		servers.push(hydrateServer(name, config, claudianMeta[name] ?? {}));
	}

	return ok(servers);
}

function hydrateServer(
	name: string,
	config: McpServerConfig,
	meta: SidecarMeta,
): ManagedMcpServer {
	return {
		name,
		config,
		enabled: typeof meta.enabled === 'boolean' ? meta.enabled : DEFAULT_MCP_SERVER.enabled,
		contextSaving:
			typeof meta.contextSaving === 'boolean'
				? meta.contextSaving
				: DEFAULT_MCP_SERVER.contextSaving,
		disabledTools: normalizeDisabledTools(meta.disabledTools),
		description: typeof meta.description === 'string' ? meta.description : undefined,
	};
}

function readSidecarServers(file: Record<string, unknown>): Record<string, SidecarMeta> {
	const claudian = file._claudian;
	if (!isRecord(claudian) || !isRecord(claudian.servers)) return {};
	return claudian.servers as Record<string, SidecarMeta>;
}

function normalizeDisabledTools(raw: unknown): string[] | undefined {
	if (!Array.isArray(raw)) return undefined;
	const filtered = raw.filter(
		(tool): tool is string => typeof tool === 'string' && tool.trim().length > 0,
	);
	return filtered.length > 0 ? filtered : undefined;
}

/**
 * Serialise a server list to `.claude/mcp.json` document text (REQ-MC-007), writing
 * `mcpServers` + ONLY the non-default `_claudian.servers` metadata (a default-valued
 * server writes no sidecar entry). Preserves any unknown top-level keys AND any
 * non-`servers` `_claudian` keys the prior `existingRaw` had, so a Specorator edit
 * never strips a CLI-written field. 2-space indent. Total.
 */
export function serializeMcpConfig(
	servers: readonly ManagedMcpServer[],
	existingRaw: string | null,
): Result<string> {
	const mcpServers: Record<string, McpServerConfig> = {};
	const claudianServers: Record<string, SidecarMeta> = {};

	for (const server of servers) {
		mcpServers[server.name] = server.config;
		const meta = buildSidecarMeta(server);
		if (Object.keys(meta).length > 0) {
			claudianServers[server.name] = meta;
		}
	}

	const existing = parseExisting(existingRaw);
	const base: Record<string, unknown> = existing !== null ? { ...existing } : {};
	// Rebuild without `_claudian` (the codec ban forbids `delete`); the resolved
	// sidecar is re-added below only when non-empty.
	const { _claudian: _drop, ...rest } = base;
	void _drop;
	const file: Record<string, unknown> = { ...rest, mcpServers };

	const claudian = resolveClaudian(existing, claudianServers);
	if (claudian !== null) file._claudian = claudian;

	return ok(JSON.stringify(file, null, 2));
}

function buildSidecarMeta(server: ManagedMcpServer): SidecarMeta {
	const meta: SidecarMeta = {};
	if (server.enabled !== DEFAULT_MCP_SERVER.enabled) meta.enabled = server.enabled;
	if (server.contextSaving !== DEFAULT_MCP_SERVER.contextSaving) {
		meta.contextSaving = server.contextSaving;
	}
	const normalized = server.disabledTools
		?.map((tool) => tool.trim())
		.filter((tool) => tool.length > 0);
	if (normalized !== undefined && normalized.length > 0) meta.disabledTools = normalized;
	if (server.description !== undefined && server.description !== '') {
		meta.description = server.description;
	}
	return meta;
}

function parseExisting(existingRaw: string | null): Record<string, unknown> | null {
	if (existingRaw === null || existingRaw === '') return null;
	const parsed = trySync<unknown>(() => JSON.parse(existingRaw));
	return parsed.ok && isRecord(parsed.value) ? parsed.value : null;
}

/**
 * Resolve the `_claudian` block to write, or `null` when none should be written
 * (parity `McpStorage.save:113-130`). Preserves non-`servers` keys the prior doc
 * had; emits `servers` only when at least one server has non-default metadata.
 */
function resolveClaudian(
	existing: Record<string, unknown> | null,
	claudianServers: Record<string, SidecarMeta>,
): Record<string, unknown> | null {
	const existingClaudian =
		existing !== null && isRecord(existing._claudian) ? existing._claudian : null;

	if (Object.keys(claudianServers).length > 0) {
		return { ...(existingClaudian ?? {}), servers: claudianServers };
	}

	if (existingClaudian !== null) {
		const { servers: _servers, ...rest } = existingClaudian;
		void _servers;
		return Object.keys(rest).length > 0 ? rest : null;
	}

	return null;
}
