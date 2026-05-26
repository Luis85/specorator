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
	TOOLBAR_CATALOG_PORT,
	APPROVAL_RULE_STORE_PORT,
	MCP_CONFIG_STORE_PORT,
	MCP_CLIENT_PORT,
	PROVIDER_REGISTRY_PORT,
	SECRET_STORE_PORT,
	HOME_FS_PORT,
} from '@/infrastructure/bridge/ports';
import {
	CHAT_RUNTIME_FACTORY,
	CONFIRM_DELETE,
	CHOOSE_FORK_TARGET,
	INSTRUCTION_CONFIRM,
	OPEN_INLINE_EDIT,
	OPEN_IMAGE_PREVIEW,
	PICK_ATTACHMENT,
	OPEN_MCP_SERVER_MODAL,
	OPEN_MCP_TEST_MODAL,
	OPEN_PROVIDER_CONSENT,
} from '@/ui/chat/modalSeam';
import type { AttachedImage } from '@/domain/chat/attachments';
import type { AuxModelPort } from '@/domain/ports';
import type { ProviderId } from '@/domain/chat/ProviderId';
import { HOME_FS_ROOTS } from '@/domain/ports';
import { i18nTranslate } from '@/ui/i18n';
import { ProviderConsentModal } from './modals/ProviderConsentModal';
import type { ObsidianBridge } from '@/infrastructure/obsidian/ObsidianBridge';
import { ForkTargetModal } from './modals/ForkTargetModal';
import { DeleteConfirmModal } from './modals/DeleteConfirmModal';
import { InstructionConfirmModal } from './modals/InstructionConfirmModal';
import { openInlineEdit, openImagePreview } from './inlineEditLauncher';
import { pickAttachment } from './attachmentPicker';
import { buildMcpModalLaunchers } from './mcpModalLaunchers';
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
			// P9 (SPEC-PV-020): the shared descriptor-table registry + the real
			// `app.secretStorage` secret store (NEVER `data.json`) + the real `node:fs`
			// home-fs (root-scoped, read-only). The surface resolves the active provider
			// from the registry + settings, mounts the chooser, and routes a selection
			// through `SelectProviderUseCase`.
			app.provide(PROVIDER_REGISTRY_PORT, bridge.providerRegistry);
			app.provide(SECRET_STORE_PORT, bridge.secretStore);
			app.provide(HOME_FS_PORT, bridge.homeFs);
			// P9 (SPEC-PV-005/031): the widened `(providerId) => Result<runtime>` factory
			// routed through the Obsidian runtime registry — Claude reuse / Codex JSON-RPC /
			// Opencode ACP. A Claude-only configuration constructs the SAME P1 runtime as P8
			// (byte-identical, NFR-PV-001); a no-key / no-CLI / transport-unavailable build
			// returns `Result.err` (the surface surfaces an honest notice, never a throw).
			app.provide(CHAT_RUNTIME_FACTORY, (providerId: ProviderId) =>
				bridge.providerRuntimeRegistry.createChatRuntime(providerId),
			);
			// P9 (SPEC-PV-014/024, REQ-PV-082/113): the one-time beyond-vault consent
			// launcher opens the REAL Obsidian `Modal` — the Vue surface never imports
			// `obsidian` and never calls `window.confirm`. A decline disables that
			// provider's history honestly; a Claude-only user never reaches it.
			app.provide(OPEN_PROVIDER_CONSENT, (providerId: ProviderId) => {
				const provider = i18nTranslate(`agent.chat.providers.name.${providerId}`);
				const root = HOME_FS_ROOTS.join(', ');
				return new ProviderConsentModal(this.app, {
					title: i18nTranslate('agent.chat.providers.consent.title', { provider }),
					body: i18nTranslate('agent.chat.providers.consent.body', { provider, root }),
					allow: i18nTranslate('agent.chat.providers.consent.allow'),
					decline: i18nTranslate('agent.chat.providers.consent.decline'),
				}).confirm();
			});
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
			// FIX-2.2 (SPEC-CA-022/026): the paperclip attach-picker opens the Obsidian
			// vault file/image `FuzzySuggestModal`; the Vue surface routes the picked
			// path through the file-chip / image-gate paths (it never imports `obsidian`).
			app.provide(PICK_ATTACHMENT, () => pickAttachment(this.app));
			// P6 (SPEC-TC-025): the toolbar option-list source. The `ObsidianBridge`
			// exposes the real Claude static catalog; the per-tab Claude `ChatRuntimePort`
			// already reports `getToolbarCapabilities()` (read via `tabs.activeRuntime()`),
			// so the strip renders the backed widgets + the honest capability-gated seams.
			app.provide(TOOLBAR_CATALOG_PORT, bridge.toolbarCatalog);
			// P7 (SPEC-AS-019): the device-local approval-rule store
			// (`ObsidianBridge.approvalRuleStore` → `saveLocalStorage('specorator:approval-rules')`,
			// SPEC-AS-007). The surface constructs one per-surface `ApprovalManager` over it and
			// gates the active runtime's approval callback through it (mode-gate → match → auto OR
			// the unchanged P4 prompt); the per-tab Claude runtime maps the live mode to the SDK +
			// emits the plan-exit `setMode` (T-AS-012). Never `data.json`/a vault file.
			app.provide(APPROVAL_RULE_STORE_PORT, bridge.approvalRuleStore);
			// P8 (SPEC-MC-020): the MCP config store (the vault `.claude/mcp.json` round-trip,
			// the ONLY vault-file seam — ADR-MC-001) + the real SDK transport client. The
			// surface builds one per-surface `McpServerManager` over the store + gates an MCP
			// tool call (`mcp__<server>__<tool>`) through the UNCHANGED P7 `ApprovalManager`
			// (no MCP special-case, no `providerId` branch). The two modal-seam launchers open
			// the Obsidian `Modal` hosts (`McpServerModalHost`/`McpTestModalHost`) — the ONLY
			// place `obsidian`/the MCP modals are imported into the wiring; the Vue surface
			// launches them through the seam.
			app.provide(MCP_CONFIG_STORE_PORT, bridge.mcpConfigStore);
			app.provide(MCP_CLIENT_PORT, bridge.mcpClient);
			const mcpLaunchers = buildMcpModalLaunchers(
				this.app,
				bridge.mcpConfigStore,
				bridge.mcpClient,
				bridge,
				bridge,
			);
			app.provide(OPEN_MCP_SERVER_MODAL, mcpLaunchers.openMcpServerModal);
			app.provide(OPEN_MCP_TEST_MODAL, mcpLaunchers.openMcpTestModal);
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
