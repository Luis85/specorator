/**
 * `McpServerManager` — the P8 MCP lifecycle use case (SPEC-MC-012, ADR-MC-003 §2).
 * Holds the loaded `ManagedMcpServer[]`, mutates + persists it through the
 * `McpConfigStorePort`, and computes the per-turn active set. Ported from claudian
 * `core/mcp/McpServerManager.ts`.
 *
 * Contract invariants:
 *  - **Result-returning + never throws** across the port boundary — the store is
 *    `Result`-typed and the pure delegates are total (NFR-MC-004).
 *  - **Await-save before resolving** — every mutation persists the snapshot before it
 *    resolves its `Result` so the UI re-renders from the saved truth (open item #4).
 *  - **Rollback-on-save-err** — a save failure restores the prior in-memory list +
 *    surfaces a notice; the in-memory state never diverges from the persisted truth
 *    (EC-MC-18).
 *  - **Dup-reject** — `add` rejects an empty or already-present name; the existing
 *    server is left unchanged (REQ-MC-010/011, EC-MC-4).
 *  - **No secret / config value in a log or notice** (REQ-MC-072, NFR-MC-003).
 *
 * No `obsidian`, no `node:*`, no Vue (application layer, ADR-001).
 */
import type { Result } from '@/domain/shared/Result';
import { ok, err } from '@/domain/shared/Result';
import type {
	EnabledMcpServers,
	ManagedMcpServer,
	McpServerConfig,
} from '@/domain/chat/mcp/McpTypes';
import { DEFAULT_MCP_SERVER } from '@/domain/chat/mcp/McpTypes';
import { getActiveServers } from '@/domain/chat/mcp/getActiveServers';
import type { McpConfigStorePort } from '@/domain/ports';
import type { FeedbackService } from '@/application/shared/FeedbackService';
import { foldEnabledMcpServers } from './foldEnabledMcpServers';

/** The add/edit draft the modal hands the manager (the name + parsed config + metadata). */
export interface McpServerDraft {
	readonly name: string;
	readonly config: McpServerConfig;
	readonly description?: string;
	readonly contextSaving: boolean;
}

export class McpServerManager {
	/** The loaded managed list (the DTO snapshot the view-model reads). */
	private servers: ManagedMcpServer[] = [];

	constructor(
		private readonly store: McpConfigStorePort,
		private readonly feedback: FeedbackService,
	) {}

	/**
	 * Load the managed list from the store (REQ-MC-001/002). On `err` → a non-blocking
	 * notice + keep an empty list (never crashes, REQ-MC-071). Returns the list.
	 */
	async load(): Promise<Result<readonly ManagedMcpServer[]>> {
		const loaded = await this.store.load();
		if (!loaded.ok) {
			this.servers = [];
			this.feedback.info('Could not read your MCP server configuration.');
			return ok(this.servers);
		}
		this.servers = loaded.value;
		return ok(this.servers);
	}

	/** The current loaded list (DTO snapshot for the view-model). */
	getServers(): readonly ManagedMcpServer[] {
		return this.servers;
	}

	/** The enabled-server count for the selector badge (REQ-MC-015). */
	getEnabledCount(): number {
		return this.servers.reduce((count, server) => (server.enabled ? count + 1 : count), 0);
	}

	/**
	 * Add a server with default metadata (REQ-MC-010/011). Reject an empty or duplicate
	 * name (the existing server is unchanged, EC-MC-4). Awaits save (open item #4); a
	 * save `err` rolls the list back + notifies (EC-MC-18).
	 */
	async add(draft: McpServerDraft): Promise<Result<void>> {
		if (draft.name === '') {
			return err(new Error('A server name is required.'));
		}
		if (this.servers.some((server) => server.name === draft.name)) {
			return err(new Error(`A server named "${draft.name}" already exists.`));
		}
		const next = [
			...this.servers,
			{
				name: draft.name,
				config: draft.config,
				enabled: DEFAULT_MCP_SERVER.enabled,
				contextSaving: draft.contextSaving,
				description: draft.description,
			},
		];
		return this.commit(next, 'mcp: add server');
	}

	/** Replace a server's config / description / contextSaving by name (REQ-MC-012). Awaits save. */
	async edit(name: string, draft: McpServerDraft): Promise<Result<void>> {
		const index = this.servers.findIndex((server) => server.name === name);
		if (index === -1) {
			return err(new Error(`No server named "${name}" to edit.`));
		}
		const existing = this.servers[index];
		const next = [...this.servers];
		next[index] = {
			...existing,
			config: draft.config,
			description: draft.description,
			contextSaving: draft.contextSaving,
		};
		return this.commit(next, 'mcp: edit server');
	}

	/** Remove a server + its sidecar entry by name (REQ-MC-013). Awaits save. */
	async remove(name: string): Promise<Result<void>> {
		const next = this.servers.filter((server) => server.name !== name);
		if (next.length === this.servers.length) {
			return err(new Error(`No server named "${name}" to remove.`));
		}
		return this.commit(next, 'mcp: remove server');
	}

	/** Toggle a server's `enabled` (REQ-MC-014). Awaits save. */
	async setEnabled(name: string, enabled: boolean): Promise<Result<void>> {
		const index = this.servers.findIndex((server) => server.name === name);
		if (index === -1) {
			return err(new Error(`No server named "${name}" to toggle.`));
		}
		const next = [...this.servers];
		next[index] = { ...this.servers[index], enabled };
		return this.commit(next, 'mcp: set enabled');
	}

	/** Add/remove a tool from a server's `disabledTools` (REQ-MC-016). Awaits save. */
	async setToolDisabled(name: string, tool: string, disabled: boolean): Promise<Result<void>> {
		const index = this.servers.findIndex((server) => server.name === name);
		if (index === -1) {
			return err(new Error(`No server named "${name}" to update.`));
		}
		const existing = this.servers[index];
		const current = existing.disabledTools ?? [];
		const updated = disabled
			? current.includes(tool)
				? current
				: [...current, tool]
			: current.filter((entry) => entry !== tool);
		const next = [...this.servers];
		next[index] = {
			...existing,
			disabledTools: updated.length === 0 ? undefined : updated,
		};
		return this.commit(next, 'mcp: set tool disabled');
	}

	/**
	 * The active enabled servers for a turn (REQ-MC-052). P8 ALWAYS passes ∅ (open
	 * item #1). Pure delegate to SPEC-MC-006.
	 */
	getActiveServers(mentionedNames: ReadonlySet<string>): Record<string, McpServerConfig> {
		return getActiveServers(this.servers, mentionedNames);
	}

	/**
	 * The folded `{ servers, disallowedTools }` for the turn, or `undefined` when the
	 * active set is empty (REQ-MC-052/054/082). Delegates to SPEC-MC-013.
	 */
	getEnabledMcpServers(mentionedNames: ReadonlySet<string>): EnabledMcpServers | undefined {
		return foldEnabledMcpServers(this.servers, mentionedNames);
	}

	/**
	 * Persist a mutated list, awaiting the save before resolving. On `err` keep the
	 * prior in-memory list (rollback) + surface a notice (REQ-MC-072); on `ok` adopt
	 * the new list. Never throws across the boundary (the store is `Result`-typed).
	 */
	private async commit(next: ManagedMcpServer[], operation: string): Promise<Result<void>> {
		const saved = await this.store.save(next);
		if (!saved.ok) {
			this.feedback.reportResult(saved, {
				operation,
				errorLabel: 'Could not save your MCP server configuration',
			});
			return err(saved.error);
		}
		this.servers = next;
		return ok(undefined);
	}
}
