import { Modal, type App } from 'obsidian';
import { type App as VueApp, createApp, h } from 'vue';
import McpTestModal from '@/ui/chat/mcp/McpTestModal.vue';
import { i18n } from '@/ui/i18n';
import { MCP_CLIENT_PORT } from '@/infrastructure/bridge/ports';
import type { McpClientPort } from '@/domain/ports';
import type { McpServerManager } from '@/application/chat/mcp/McpServerManager';
import type { ManagedMcpServer } from '@/domain/chat/mcp/McpTypes';

/**
 * The MCP test-result modal host (SPEC-MC-017/023, REQ-MC-016/030..034/044). An
 * Obsidian `Modal` subclass (it imports `obsidian`, so it lives in `src/plugin/`, NOT
 * under `src/ui/**`) that mounts the presentational `McpTestModal.vue` — which probes
 * the server through the injected `McpClientPort` (the SPEC-MC-028 five-state machine)
 * — and OWNS the per-tool toggle lifecycle: a `set-tool-disabled` event persists
 * through the per-surface `McpServerManager.setToolDisabled` (the same vault
 * `.claude/mcp.json` truth, REQ-MC-016). Resolves `Promise<void>` when dismissed (the
 * `OpenMcpTestModalFn` seam). Mirrors the P5 `InlineEditModal` mount-Vue-in-modal
 * pattern. DOM is the declarative Vue app (no `innerHTML`/`v-html`); NEVER
 * `window.confirm`/`prompt`/`alert`. Coverage-excluded → manual leg (TEST-MC-M1).
 */
export class McpTestModalHost extends Modal {
	private resolved = false;
	private resolve: (() => void) | null = null;
	private vueApp: VueApp | null = null;

	constructor(
		app: App,
		private readonly client: McpClientPort,
		private readonly manager: McpServerManager,
		private readonly server: ManagedMcpServer,
	) {
		super(app);
	}

	/** Open the modal (probe on mount) and resolve when the user dismisses it. */
	openAndWait(): Promise<void> {
		return new Promise<void>((resolve) => {
			this.resolve = resolve;
			this.open();
		});
	}

	override onOpen(): void {
		this.modalEl.addClass('sp-mcp-test-modal-host');
		const host = this.contentEl.createDiv({ cls: 'specorator-root' });
		const vueApp = createApp({
			name: 'McpTestModalRoot',
			render: () =>
				h(McpTestModal, {
					server: this.server,
					// The per-tool toggle persists through the per-surface manager (the vault
					// `.claude/mcp.json` truth). The manager awaits its own save (open item #4).
					onSetToolDisabled: (tool: string, disabled: boolean) => {
						void this.manager.setToolDisabled(this.server.name, tool, disabled);
					},
					onClose: () => {
						this.close();
					},
				}),
		});
		vueApp.use(i18n);
		// The probe runs through the injected client (the same real SDK client the surface
		// provides) — the modal's `useMcpClientPort` reads this key.
		vueApp.provide(MCP_CLIENT_PORT, this.client);
		vueApp.mount(host);
		this.vueApp = vueApp;
	}

	override onClose(): void {
		this.vueApp?.unmount();
		this.vueApp = null;
		this.contentEl.empty();
		// Dismiss resolves exactly once (Escape / click-out / the close button).
		this.settle();
	}

	/** Resolve exactly once (the first of a close button or a dismiss). */
	private settle(): void {
		if (this.resolved) return;
		this.resolved = true;
		this.resolve?.();
	}
}
