/**
 * The PURE, TOTAL guarded fold (P8, SPEC-MC-013, ADR-MC-003 §1). Produces the turn's
 * `enabledMcpServers` value ONLY when the active server map is non-empty; an empty
 * active set folds `undefined` so the surface writes no `enabledMcpServers` key — a
 * no-servers / all-disabled / all-context-saving(∅) turn stays byte-identical to P7
 * (REQ-MC-082, NFR-MC-001). `disallowedTools` is pre-registered over ALL enabled
 * servers (REQ-MC-053/054) but the field is only emitted when at least one server is
 * active. No class, no `obsidian`, no `node:*`, no Vue, no I/O. Never throws.
 */
import type { EnabledMcpServers, ManagedMcpServer } from '@/domain/chat/mcp/McpTypes';
import { collectDisallowedMcpTools, getActiveServers } from '@/domain/chat/mcp/getActiveServers';

/**
 * Fold the managed list to the turn's `enabledMcpServers` value (REQ-MC-052), or
 * `undefined` when the active server map is empty (so the turn omits the field →
 * byte-identical P7, REQ-MC-082, NFR-MC-001). Pure + total. P8 passes mentioned = ∅.
 */
export function foldEnabledMcpServers(
	servers: readonly ManagedMcpServer[],
	mentionedNames: ReadonlySet<string>,
): EnabledMcpServers | undefined {
	const active = getActiveServers(servers, mentionedNames);
	if (Object.keys(active).length === 0) return undefined;
	return { servers: active, disallowedTools: collectDisallowedMcpTools(servers) };
}
