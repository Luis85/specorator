import type { McpConfigStorePort, VaultPort } from '@/domain/ports';
import type { ManagedMcpServer } from '@/domain/chat/mcp/McpTypes';
import { deserializeMcpConfig, serializeMcpConfig } from '@/domain/chat/mcp/McpConfigCodec';
import type { Result } from '@/domain/shared/Result';
import { tryAsync } from '@/domain/shared/tryAsync';

/** The Claude-CLI-readable vault path the MCP server list persists to (ADR-MC-001). */
const MCP_CONFIG_PATH = '.claude/mcp.json';
/** The vault folder that must exist before the first write. */
const MCP_CONFIG_DIR = '.claude';

/**
 * The real vault-backed `McpConfigStorePort` (P8, SPEC-MC-009, ADR-MC-001 §2).
 * Thin I/O over the bridge's `VaultPort` on the **vault** file `.claude/mcp.json`
 * — the Claude-CLI-readable path, NOT `data.json`, NOT device-local. This is the
 * single seam diverging from the device-local precedent (ADR-AS-001 / ADR-PSR-002)
 * because the Claude CLI must read the config from a known vault path.
 *
 * The pure `McpConfigCodec` (SPEC-MC-003) is the round-trip authority — this bridge
 * only reads/writes the document text and delegates the parse/serialise (so the
 * default-pruning + CLI-key preservation live in the unit-tested codec, not here).
 * `load` is load-or-default (an absent file ⇒ the codec sees `null` ⇒ `ok([])`, no
 * migration — CHARTER-REQ-FRESH). Every method is `Result`-typed and total — a true
 * vault fault is a `Result.err`, never a throw across the boundary (NFR-MC-004); the
 * manager surfaces a notice and keeps an empty list rather than crashing (REQ-MC-072).
 *
 * Lives under `src/infrastructure/obsidian/**` (coverage-excluded, §10): its
 * behavioural gate is the MANUAL leg TEST-MC-M1 (the real `.claude/mcp.json` round-trip
 * in Obsidian; `data.json` stays untouched). No `obsidian` symbol leaks past this file —
 * it depends only on the `VaultPort` interface + the pure codec.
 */
export class VaultMcpConfigStore implements McpConfigStorePort {
	constructor(private readonly vault: VaultPort) {}

	async load(): Promise<Result<ManagedMcpServer[]>> {
		const read = await this._readRaw();
		if (!read.ok) return read;
		return deserializeMcpConfig(read.value);
	}

	async save(servers: readonly ManagedMcpServer[]): Promise<Result<void>> {
		const existing = await this._readRaw();
		if (!existing.ok) return existing;

		const serialized = serializeMcpConfig(servers, existing.value);
		if (!serialized.ok) return serialized;

		return tryAsync(async () => {
			await this.vault.createFolder(MCP_CONFIG_DIR);
			await this.vault.writeFile(MCP_CONFIG_PATH, serialized.value);
		});
	}

	async exists(): Promise<Result<boolean>> {
		return tryAsync(() => this.vault.fileExists(MCP_CONFIG_PATH));
	}

	/**
	 * Read the document text, or `null` when the file is absent (the codec's
	 * load-or-default input). A true read fault ⇒ `err`. Distinguishes absent
	 * (→ `ok(null)`) from a genuine failure via a prior `fileExists` probe so a
	 * missing file is never an error.
	 */
	private async _readRaw(): Promise<Result<string | null>> {
		return tryAsync(async () => {
			const present = await this.vault.fileExists(MCP_CONFIG_PATH);
			if (!present) return null;
			return this.vault.readFile(MCP_CONFIG_PATH);
		});
	}
}
