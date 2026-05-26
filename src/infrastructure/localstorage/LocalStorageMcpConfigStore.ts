import type { McpConfigStorePort } from '@/domain/ports';
import type { ManagedMcpServer } from '@/domain/chat/mcp/McpTypes';
import { deserializeMcpConfig, serializeMcpConfig } from '@/domain/chat/mcp/McpConfigCodec';
import type { Result } from '@/domain/shared/Result';
import { ok, err } from '@/domain/shared/Result';

/** Stable browser-localStorage key holding the `.claude/mcp.json` document text. */
const MCP_CONFIG_KEY = 'specorator:mcp-config';

/**
 * Browser-`localStorage` `McpConfigStorePort` (SPEC-MC-011, ADR-MC-001) for the
 * GitHub Pages demo — no Obsidian/vault runtime. Holds the `.claude/mcp.json`
 * document text under a stable key; the pure `McpConfigCodec` is the round-trip
 * authority (parse/serialise + default-pruning + CLI-key preservation live in the
 * unit-tested codec, not here). `load` is load-or-default (a missing/unparseable
 * blob ⇒ the codec sees `null`/text ⇒ `ok([])`, no migration). Every method is
 * `Result`-typed and total — never throws across the boundary. No `obsidian`, no `node:*`.
 */
export class LocalStorageMcpConfigStore implements McpConfigStorePort {
	load(): Promise<Result<ManagedMcpServer[]>> {
		return Promise.resolve(deserializeMcpConfig(this._readRaw()));
	}

	save(servers: readonly ManagedMcpServer[]): Promise<Result<void>> {
		const serialized = serializeMcpConfig(servers, this._readRaw());
		if (!serialized.ok) return Promise.resolve(serialized);
		try {
			localStorage.setItem(MCP_CONFIG_KEY, serialized.value);
			return Promise.resolve(ok(undefined));
		} catch (e) {
			return Promise.resolve(err(e instanceof Error ? e : new Error(String(e))));
		}
	}

	exists(): Promise<Result<boolean>> {
		return Promise.resolve(ok(localStorage.getItem(MCP_CONFIG_KEY) !== null));
	}

	/** The stored document text, or `null` when absent (the codec's load-or-default input). */
	private _readRaw(): string | null {
		return localStorage.getItem(MCP_CONFIG_KEY);
	}
}
