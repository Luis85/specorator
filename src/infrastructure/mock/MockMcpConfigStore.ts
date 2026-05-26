import type { McpConfigStorePort } from '@/domain/ports';
import type { ManagedMcpServer } from '@/domain/chat/mcp/McpTypes';
import { deserializeMcpConfig, serializeMcpConfig } from '@/domain/chat/mcp/McpConfigCodec';
import type { Result } from '@/domain/shared/Result';
import { ok, err } from '@/domain/shared/Result';

/** Which store operation the failure-injection switch forces to `Result.err`. */
export type MockMcpStoreFailMode = 'none' | 'load' | 'save';

/**
 * Scriptable in-memory `McpConfigStorePort` (SPEC-MC-010, ADR-MC-001 §2) for unit
 * tests + `npm run dev`. Holds the `.claude/mcp.json` **document text** in memory and
 * round-trips it through the **same pure `McpConfigCodec`** the real bridge uses, so
 * the default-pruning + CLI-key-preservation behaviour is exercised by the automated
 * tests (the manager / settings / selector tests inject this instead of a real
 * provider):
 *
 *   - `seedMcpServers(servers)` pre-populates the managed list (serialised through the
 *     codec, so a subsequent `load` sees the same prune/hydrate path);
 *   - `load`/`save`/`exists` operate on the in-memory document, all `Promise<Result<…>>`;
 *   - `setMcpStoreFailMode('load' | 'save' | 'none')` forces `load`/`save` to
 *     `Result.err` so the save-fail notice (TEST-MC-072) + the malformed-load
 *     resilience run deterministically.
 *
 * Total — never throws across the boundary (NFR-MC-006): a forced fault is an `err`
 * value, never a throw. No `obsidian`, no `node:*`.
 */
export class MockMcpConfigStore implements McpConfigStorePort {
	/** The in-memory `.claude/mcp.json` document text (`null` ⇒ the file is absent). */
	private raw: string | null = null;
	private failMode: MockMcpStoreFailMode = 'none';

	/** Test hook: pre-populate the managed list (serialised through the pure codec). */
	seedMcpServers(servers: readonly ManagedMcpServer[]): void {
		const serialized = serializeMcpConfig(servers, this.raw);
		this.raw = serialized.ok ? serialized.value : this.raw;
	}

	/** Test hook: force `load`/`save` to `Result.err` (the save-fail / resilience driver). */
	setMcpStoreFailMode(mode: MockMcpStoreFailMode): void {
		this.failMode = mode;
	}

	load(): Promise<Result<ManagedMcpServer[]>> {
		if (this.failMode === 'load') {
			return Promise.resolve(err(new Error('mock mcp store: forced load failure')));
		}
		return Promise.resolve(deserializeMcpConfig(this.raw));
	}

	save(servers: readonly ManagedMcpServer[]): Promise<Result<void>> {
		if (this.failMode === 'save') {
			return Promise.resolve(err(new Error('mock mcp store: forced save failure')));
		}
		const serialized = serializeMcpConfig(servers, this.raw);
		if (!serialized.ok) return Promise.resolve(serialized);
		this.raw = serialized.value;
		return Promise.resolve(ok(undefined));
	}

	exists(): Promise<Result<boolean>> {
		return Promise.resolve(ok(this.raw !== null));
	}
}
