/**
 * The MCP config store port (P8, SPEC-MC-007, ADR-MC-001 §2). One narrow store-only
 * port for one consumer (`McpServerManager`); its own `InjectionKey` + composable,
 * no aggregate (ADR-008, NFR-MC-005). Models the `.claude/mcp.json` document
 * round-trip via the pure `McpConfigCodec` (SPEC-MC-003) — the codec is the
 * round-trip authority; the bridge does only the device-vault I/O. The MCP config is
 * a **vault** artifact (NOT `data.json`, NOT device-local), the single seam diverging
 * from the device-local precedent because the Claude CLI must read it (ADR-MC-001).
 * Every method is `Result`-typed (ADR-004); a store fault surfaces as `Result.err`,
 * never a throw across the boundary. No class, no `obsidian`, no `node:*`.
 */
import type { Result } from '@/domain/shared/Result';
import type { ManagedMcpServer } from '@/domain/chat/mcp/McpTypes';

export interface McpConfigStorePort {
	/**
	 * Load-or-default the managed servers from `.claude/mcp.json` (REQ-MC-001/002).
	 * Read the document text (or `null` when absent) → `deserializeMcpConfig`
	 * (SPEC-MC-003). An absent/empty/unparseable doc ⇒ `ok([])` — NO migration
	 * (CHARTER-REQ-FRESH). A true vault-read failure ⇒ `err`. No side effects.
	 */
	load(): Promise<Result<ManagedMcpServer[]>>;
	/**
	 * Persist the full server list (REQ-MC-007). Read the prior doc text, hand
	 * `(servers, existingRaw)` to `serializeMcpConfig` (preserving CLI-written keys +
	 * pruning default `_claudian` metadata), write `.claude/mcp.json` (creating
	 * `.claude/` when absent). A write failure ⇒ `err` (the manager surfaces a notice,
	 * never crashes — REQ-MC-072). One vault write.
	 */
	save(servers: readonly ManagedMcpServer[]): Promise<Result<void>>;
	/** Whether `.claude/mcp.json` exists in the vault. A read failure ⇒ `err`. No side effects. */
	exists(): Promise<Result<boolean>>;
}
