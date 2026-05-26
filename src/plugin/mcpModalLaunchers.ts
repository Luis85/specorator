import type { App } from 'obsidian';
import type { LoggerPort, McpClientPort, McpConfigStorePort, NotificationPort } from '@/domain/ports';
import { McpServerManager, type McpServerDraft } from '@/application/chat/mcp/McpServerManager';
import { FeedbackService } from '@/application/shared/FeedbackService';
import type { ManagedMcpServer } from '@/domain/chat/mcp/McpTypes';
import { McpServerModalHost } from './modals/McpServerModalHost';
import { McpTestModalHost } from './modals/McpTestModalHost';

/**
 * The P8 MCP modal-seam launchers (SPEC-MC-020/023, ADR-MC-003). This is the ONLY
 * place the two Obsidian `Modal` hosts are wired into the production seam —
 * `AgentSidebarView` provides these as `OPEN_MCP_SERVER_MODAL` / `OPEN_MCP_TEST_MODAL`,
 * so the Vue surface never imports `obsidian` or the modals (NFR-MC-005/007). Each
 * launcher opens its Obsidian `Modal` host and resolves the seam contract:
 *
 * - `openMcpServerModal(input?)` → `Promise<McpServerDraft | null>` (the add/edit form;
 *   `null` on dismiss — the surface adds nothing, REQ-MC-042). The launcher reads the
 *   live `existingNames` from the vault store so the modal's duplicate guard never lets
 *   an edit overwrite a sibling (REQ-MC-011).
 * - `openMcpTestModal(server)` → `Promise<void>` (the probe + per-tool toggle lifecycle;
 *   resolves on dismiss, REQ-MC-044). A per-tool toggle persists through a launcher-local
 *   `McpServerManager` over the SAME vault `.claude/mcp.json` truth (REQ-MC-016).
 */
export function buildMcpModalLaunchers(
	app: App,
	store: McpConfigStorePort,
	client: McpClientPort,
	logger: LoggerPort,
	notify: NotificationPort,
): {
	openMcpServerModal: (input?: McpServerDraft) => Promise<McpServerDraft | null>;
	openMcpTestModal: (server: ManagedMcpServer) => Promise<void>;
} {
	const feedback = new FeedbackService(logger, notify);

	async function existingNames(): Promise<readonly string[]> {
		const loaded = await store.load();
		return loaded.ok ? loaded.value.map((server) => server.name) : [];
	}

	return {
		openMcpServerModal: async (input?: McpServerDraft) =>
			new McpServerModalHost(app, {
				input,
				existingNames: await existingNames(),
			}).openAndWait(),
		openMcpTestModal: (server: ManagedMcpServer) => {
			// A launcher-local manager loads the live list then persists a per-tool toggle to
			// the same vault file the surface's per-surface manager reads on its next load.
			const manager = new McpServerManager(store, feedback);
			return manager
				.load()
				.then(() => new McpTestModalHost(app, client, manager, server).openAndWait());
		},
	};
}
