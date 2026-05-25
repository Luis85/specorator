import { ItemView, type WorkspaceLeaf } from 'obsidian';
import { type App as VueApp, createApp, h } from 'vue';
import { createPinia } from 'pinia';
import ChatSurface from '@/ui/chat/ChatSurface.vue';
import ErrorBoundary from '@/ui/components/ErrorBoundary.vue';
import { i18n, setLocale, toSupportedLocale } from '@/ui/i18n';
import {
	SETTINGS_PORT,
	VAULT_PORT,
	WORKSPACE_PORT,
	NOTIFICATION_PORT,
	LOGGER_PORT,
	COMMUNITY_PLUGIN_PORT,
	CHAT_RUNTIME_PORT,
	MARKDOWN_RENDER_PORT,
	ICON_PORT,
	PROVIDER_HISTORY_PORT,
	MENTION_DATA_PROVIDER_PORT,
	PROVIDER_COMMAND_CATALOG_PORT,
	SHELL_EXEC_PORT,
	AUX_MODEL_PORT,
	SELECTION_SOURCE_PORT,
	SELECTION_HIGHLIGHT_PORT,
} from '@/infrastructure/bridge/ports';
import {
	CHAT_RUNTIME_FACTORY,
	CONFIRM_DELETE,
	CHOOSE_FORK_TARGET,
	INSTRUCTION_CONFIRM,
	OPEN_INLINE_EDIT,
	OPEN_IMAGE_PREVIEW,
} from '@/ui/chat/modalSeam';
import type { AttachedImage } from '@/domain/chat/attachments';
import type { AuxModelPort } from '@/domain/ports';
import type { ObsidianBridge } from '@/infrastructure/obsidian/ObsidianBridge';
import { ForkTargetModal } from './modals/ForkTargetModal';
import { DeleteConfirmModal } from './modals/DeleteConfirmModal';
import { InstructionConfirmModal } from './modals/InstructionConfirmModal';
import { openInlineEdit, openImagePreview } from './inlineEditLauncher';
import type SpecoratorPlugin from './main';

/** The single view type the plugin registers (SPEC-PSR-005). */
export const VIEW_TYPE_AGENT = 'specorator-agent';

/**
 * The agent chat sidebar (P1 chat-core — SPEC-CC-022). Mounts `ChatSurface`
 * inside `ErrorBoundary` (so component errors route through LoggerPort +
 * NotificationPort), installs Pinia + i18n, and provides the six core ports plus
 * the chat ports — `CHAT_RUNTIME_PORT` from `bridge.createChatRuntime()` (one
 * fresh runtime per mounted view), `MARKDOWN_RENDER_PORT` from the bridge's
 * markdown port, and `ICON_PORT` from `bridge.createIconPort()` (P2 rich-rendering
 * — SPEC-RR-021, so the block renderers' `SpIcon`s resolve through the port).
 * `onClose` unmounts the app, whose `ChatSurface.onBeforeUnmount` cancels the
 * in-flight turn + resets the store before teardown (EC-15). The tab icon is a
 * native Lucide name (`bot`), set via Obsidian's own `getIcon`.
 */
export class AgentSidebarView extends ItemView {
	private vueApp: VueApp | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: SpecoratorPlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_AGENT;
	}

	getDisplayText(): string {
		return 'Specorator agent';
	}

	getIcon(): string {
		return 'bot';
	}

	override onOpen(): Promise<void> {
		const bridge = this.plugin.bridge;
		if (bridge !== null) {
			setLocale(toSupportedLocale(this.plugin.settings.locale));

			const host = this.contentEl.createDiv({ cls: 'specorator-root specorator-agent-root' });
			const app = createApp({
				name: 'AgentRoot',
				render: () => h(ErrorBoundary, null, { default: () => h(ChatSurface) }),
			});
			app.use(createPinia());
			app.use(i18n);
			app.provide(SETTINGS_PORT, bridge);
			app.provide(VAULT_PORT, bridge);
			app.provide(WORKSPACE_PORT, bridge);
			app.provide(NOTIFICATION_PORT, bridge);
			app.provide(LOGGER_PORT, bridge);
			app.provide(COMMUNITY_PLUGIN_PORT, bridge);
			app.provide(CHAT_RUNTIME_PORT, bridge.createChatRuntime());
			app.provide(MARKDOWN_RENDER_PORT, bridge.createMarkdownRenderPort());
			app.provide(ICON_PORT, bridge.createIconPort());
			// P3 (SPEC-TS-027): the history seam + the per-tab runtime factory (one
			// runtime per tab, ADR-TS-002 §1) + the Obsidian Modal launch seams. The
			// Vue surface never imports `obsidian`; it launches the modals through these.
			app.provide(PROVIDER_HISTORY_PORT, bridge.createProviderHistoryPort());
			app.provide(CHAT_RUNTIME_FACTORY, () => bridge.createChatRuntime());
			app.provide(CONFIRM_DELETE, (message: string) =>
				new DeleteConfirmModal(this.app, {
					message,
					confirm: 'Delete',
					cancel: 'Cancel',
				}).confirm(),
			);
			app.provide(CHOOSE_FORK_TARGET, () =>
				new ForkTargetModal(this.app, {
					title: 'Fork conversation',
					newTab: 'New tab',
					currentTab: 'Current tab',
				}).choose(),
			);
			// P4 (SPEC-CP-028/038): the composer ports. Mention/catalog are per-mount
			// factories (the Claude impl binds to the active provider context); ShellExec
			// is stateless (the bridge IS the port). The instruction-confirm seam opens
			// the REAL Obsidian Modal — the Vue surface never imports `obsidian`.
			app.provide(MENTION_DATA_PROVIDER_PORT, bridge.createMentionDataProvider());
			app.provide(PROVIDER_COMMAND_CATALOG_PORT, bridge.createProviderCommandCatalog());
			app.provide(SHELL_EXEC_PORT, bridge.shellExec);
			app.provide(INSTRUCTION_CONFIRM, (instruction: string) =>
				new InstructionConfirmModal(this.app, instruction, {
					title: 'Add a system instruction',
					accept: 'Add instruction',
					reject: 'Cancel',
				}).confirm(),
			);
			// P5 (SPEC-CA-026): the cold-start aux + the selection capture/paint ports +
			// the two Obsidian Modal launchers. The aux is genuinely provided here (the
			// re-pointed title/refine use cases + InlineEditUseCase consume it — no more
			// degrade-to-err window, T-CA-011/044). The inline-edit launcher builds the
			// use case over the aux, opens `InlineEditModal`, and applies the accepted
			// edit to the active editor; the image-preview launcher opens
			// `ImagePreviewModal`. These are the ONLY place `obsidian`/the P5 modals are
			// imported into the wiring — the Vue surface launches them through the seam.
			app.provide(AUX_MODEL_PORT, this.resolveAuxModel(bridge));
			app.provide(SELECTION_SOURCE_PORT, bridge.selectionSource);
			app.provide(SELECTION_HIGHLIGHT_PORT, bridge.selectionHighlight);
			app.provide(OPEN_INLINE_EDIT, (selectedText: string, notePath?: string) =>
				openInlineEdit(this.app, this.resolveAuxModel(bridge), bridge, { selectedText, notePath }),
			);
			app.provide(OPEN_IMAGE_PREVIEW, (image: AttachedImage) =>
				openImagePreview(this.app, image),
			);
			app.mount(host);
			this.vueApp = app;
		}
		return Promise.resolve();
	}

	override onClose(): Promise<void> {
		this.vueApp?.unmount();
		this.vueApp = null;
		this.contentEl.empty();
		return Promise.resolve();
	}

	/**
	 * Resolve the cold-start `AuxModelPort` from the runtime bridge (SPEC-CA-026).
	 * The production `ObsidianBridge` exposes a `createAuxModel()` factory (a fresh
	 * cold-start runtime per call); the `MockBridge` used by `npm run dev` + the
	 * mount tests exposes the equivalent `auxModel` getter. This seam tolerates both
	 * bridge shapes so the surface gets a genuine aux either way (NFR-CA-002).
	 */
	private resolveAuxModel(bridge: ObsidianBridge): AuxModelPort {
		const candidate = bridge as Partial<{
			createAuxModel: () => AuxModelPort;
			auxModel: AuxModelPort;
		}>;
		return candidate.createAuxModel?.() ?? candidate.auxModel!;
	}
}
