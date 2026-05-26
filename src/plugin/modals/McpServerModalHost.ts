import { Modal, type App } from 'obsidian';
import { type App as VueApp, createApp, h } from 'vue';
import McpServerModal from '@/ui/chat/mcp/McpServerModal.vue';
import { i18n } from '@/ui/i18n';
import type { McpServerDraft } from '@/application/chat/mcp/McpServerManager';

/**
 * The add/edit MCP-server modal host (SPEC-MC-016/023, REQ-MC-010/012/042/043). An
 * Obsidian `Modal` subclass (it imports `obsidian`, so it lives in `src/plugin/`, NOT
 * under `src/ui/**`) that mounts the presentational `McpServerModal.vue` as a tiny Vue
 * app and bridges its `submit`/`cancel` events to a `Promise<McpServerDraft | null>`
 * (the `OpenMcpServerModalFn` seam). `submit` resolves the draft; `cancel`/Escape/
 * dismiss resolves `null` (a missing add — the surface adds nothing). The
 * `existingNames` list drives the modal's duplicate guard so an edit never overwrites a
 * sibling. Mirrors the P5 `InlineEditModal` mount-Vue-in-modal pattern. DOM is the
 * declarative Vue app (no `innerHTML`/`v-html`); NEVER `window.confirm`/`prompt`/
 * `alert`. Coverage-excluded → manual leg (TEST-MC-M1).
 */
export class McpServerModalHost extends Modal {
	private resolved = false;
	private resolve: ((value: McpServerDraft | null) => void) | null = null;
	private vueApp: VueApp | null = null;

	constructor(
		app: App,
		private readonly params: { input?: McpServerDraft; existingNames: readonly string[] },
	) {
		super(app);
	}

	/** Open the modal pre-bound to the add/edit input and resolve the draft (or `null`). */
	openAndWait(): Promise<McpServerDraft | null> {
		return new Promise<McpServerDraft | null>((resolve) => {
			this.resolve = resolve;
			this.open();
		});
	}

	override onOpen(): void {
		this.modalEl.addClass('sp-mcp-modal-host');
		const host = this.contentEl.createDiv({ cls: 'specorator-root' });
		const vueApp = createApp({
			name: 'McpServerModalRoot',
			render: () =>
				h(McpServerModal, {
					input: this.params.input,
					existingNames: this.params.existingNames,
					onSubmit: (draft: McpServerDraft) => {
						this.settle(draft);
						this.close();
					},
					onCancel: () => {
						this.settle(null);
						this.close();
					},
				}),
		});
		vueApp.use(i18n);
		vueApp.mount(host);
		this.vueApp = vueApp;
	}

	override onClose(): void {
		this.vueApp?.unmount();
		this.vueApp = null;
		this.contentEl.empty();
		// Dismiss without a submit resolves null exactly once (Escape / click-out).
		this.settle(null);
	}

	/** Resolve exactly once (the first of a submit draft or a dismiss). */
	private settle(value: McpServerDraft | null): void {
		if (this.resolved) return;
		this.resolved = true;
		this.resolve?.(value);
	}
}
