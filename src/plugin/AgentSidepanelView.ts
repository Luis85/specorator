import { ItemView, Platform, type WorkspaceLeaf } from 'obsidian';
import { createApp, ref, watch, type App as VueApp, type Ref } from 'vue';
import { createPinia, type Pinia } from 'pinia';
import { i18n, setLocale, type SupportedLocale } from '@/ui/i18n';
import AgentSidepanelRoot from '@/ui/agent/AgentSidepanelRoot.vue';
import {
	SETTINGS_PORT,
	VAULT_PORT,
	WORKSPACE_PORT,
	NOTIFICATION_PORT,
	LOGGER_PORT,
	CHAT_TRANSPORT_PORT,
	PROVIDER_REGISTRY_KEY,
	COMMUNITY_PLUGIN_PORT,
	CONFIRM_MODAL_PORT,
	MARKDOWN_RENDER_PORT,
	SECRET_STORE_PORT,
	IS_MOBILE_KEY,
	SETTINGS_VERSION_KEY,
	TRANSPORT_KIND_KEY,
	OPEN_PLUGIN_SETTINGS_KEY,
	ICON_PORT,
} from '@/infrastructure/bridge/ports';
import { ObsidianMarkdownRenderAdapter } from '@/infrastructure/obsidian/ObsidianMarkdownRenderAdapter';
import type { ChatTransportPort, ConfirmModalPort, TransportLifecyclePort } from '@/domain/ports';
import type { PluginSettings } from '@/domain/settings/PluginSettings';
import type { TransportKind } from '@/domain/chat/TransportKind';
import type { TransportSelection } from './SpecoratorView';
import { useChatThreadsStore } from '@/ui/stores/chatThreadsStore';
import { useMessagesStore } from '@/ui/stores/messagesStore';
import { mostRecentlyUsedThreadId } from './chatThreadsPersistence';
import { trySync } from '@/domain/shared/tryAsync';
import type SpecoratorPlugin from './main';

/**
 * Factory closure provided by `main.ts`. Same shape as the one used by the
 * legacy `SpecoratorView` chat embed (SPEC-ASM-001 §9.1): wraps the four
 * candidate ports + `cliResolved` snapshot so the view only needs to pass
 * current settings to obtain a `TransportSelection`.
 */
export type SelectAgentTransportFactory = (settings: PluginSettings) => TransportSelection;

export interface AgentSidepanelViewOptions {
	readonly subscriptionAdapter: ChatTransportPort;
	readonly selectTransport: SelectAgentTransportFactory;
	readonly confirmModalAdapter?: ConfirmModalPort;
	/**
	 * Optional lifecycle handles for the SDK and subscription transports.
	 * Split off `ChatTransportPort` in WP-12 (Arch review #3) — `startup`/`shutdown`
	 * no longer live on the streaming port. The plugin layer owns the adapter
	 * instances and passes the same objects under both contracts. Optional so
	 * legacy test wiring that omitted lifecycle continues to compile; missing
	 * handles result in a no-op refresh.
	 */
	readonly sdkLifecycle?: TransportLifecyclePort;
	readonly subscriptionLifecycle?: TransportLifecyclePort;
}

export const VIEW_TYPE_AGENT = 'specorator-agent';

/**
 * Dedicated single-purpose sidepanel for the Specorator agent chat
 * (IDEA-ASV-001 / specs/agent-sidepanel-v2). Replaces the previous embedded
 * `/chat` tab inside `SpecoratorView`: the chat now lives in its own
 * `ItemView` so users can dock it alongside the main Specorator panel and
 * keep the conversation visible while navigating features/settings.
 *
 * Mounts its own Vue app with a fresh Pinia and provides every port the
 * `ChatSidebar` tree expects. The router is intentionally omitted — this
 * view has a single purpose and a single surface.
 */
export class AgentSidepanelView extends ItemView {
	private vueApp: VueApp | null = null;
	private _onUnhandledRejection: ((e: PromiseRejectionEvent) => void) | null = null;

	/**
	 * Pinia instance backing the chat store. Exposed so `main.ts` can mutate
	 * the chat store from Obsidian event handlers (file-menu "Add to chat
	 * context" entry; active-leaf-change to refresh the auto context slot).
	 * Set in `onOpen()` after `createPinia()`; cleared in `onClose()`.
	 */
	public pinia: Pinia | null = null;

	/**
	 * Reactive counter. Incremented by `bumpSettingsVersion()` each time the
	 * Anthropic API key (or any chat-relevant setting) is saved. The Vue
	 * sidepanel watches this to re-check adapter availability.
	 */
	private readonly _settingsVersion = ref(0);

	private readonly _activeClaudeCliPort: Ref<ChatTransportPort>;
	private readonly _activeTransportKind: Ref<TransportKind>;
	private readonly _options: AgentSidepanelViewOptions | null;

	/**
	 * Set by `bumpSettingsVersion()` when called mid-turn. The watcher
	 * installed in `onOpen()` consumes the flag when the chat status
	 * transitions back out of `'loading'` and applies the deferred transport
	 * refresh (Codex P1, PR #350 — pattern carried over from `SpecoratorView`).
	 */
	private _pendingSettingsRefresh = false;
	private _statusWatchStop: (() => void) | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: SpecoratorPlugin,
		private readonly claudeCliPort: ChatTransportPort,
		options?: AgentSidepanelViewOptions,
	) {
		super(leaf);
		this._options = options ?? null;
		const initialSelection =
			this._options !== null ? this._options.selectTransport(this.plugin.settings) : null;
		const initialPort = initialSelection !== null ? initialSelection.port : this.claudeCliPort;
		this._activeClaudeCliPort = ref(initialPort);
		const initialKind: TransportKind =
			initialSelection !== null ? initialSelection.kind : 'degraded';
		this._activeTransportKind = ref(initialKind);
	}

	getViewType(): string {
		return VIEW_TYPE_AGENT;
	}
	getDisplayText(): string {
		return 'Specorator agent';
	}
	getIcon(): string {
		return 'message-square';
	}

	onOpen(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();

		const mountPoint = container.createDiv({
			cls: 'specorator-agent-root specorator-root',
			attr: { id: 'specorator-agent-root', style: 'height:100%;overflow:auto;' },
		});

		const bridge = this.plugin.bridge!;

		setLocale(this.plugin.settings.locale as SupportedLocale);

		this.pinia = createPinia();

		// Hydrate persisted chat threads. The plugin decoded the blob during
		// `loadSettings()`; malformed records were already filtered out and
		// logged at `warn`. Seed `activeThreadId` to the most recently used
		// record so the panel resumes the user's last conversation on reopen.
		// Subscribe to subsequent mutations so any change to `chatThreads`
		// triggers the plugin's debounced flush.
		const persisted = this.plugin.getInitialChatThreads();
		const threadsStore = useChatThreadsStore(this.pinia);
		for (const record of persisted) threadsStore.upsertThread(record);
		threadsStore.setActiveThreadId(mostRecentlyUsedThreadId(persisted));
		threadsStore.$subscribe((_mutation, state) => {
			this.plugin.scheduleChatThreadsPersistence(state.chatThreads);
		});

		this._installPendingRefreshWatcher();

		this.vueApp = createApp(AgentSidepanelRoot);
		this.vueApp.use(this.pinia);
		this.vueApp.use(i18n);
		this.vueApp.provide(SETTINGS_PORT, bridge);
		this.vueApp.provide(VAULT_PORT, bridge);
		this.vueApp.provide(WORKSPACE_PORT, bridge);
		this.vueApp.provide(NOTIFICATION_PORT, bridge);
		this.vueApp.provide(LOGGER_PORT, bridge);
		// REQ-AUX-001 / ADR-AUX-001 — sole seam for obsidian.setIcon. Consumed by
		// <SpIcon>; production wraps `obsidian.setIcon` on the bridge.
		this.vueApp.provide(ICON_PORT, bridge);
		this._refreshActivePort();
		const portRef = this._activeClaudeCliPort;
		const reactivePort = new Proxy({} as ChatTransportPort, {
			get(_target, prop): unknown {
				const current = portRef.value as unknown as Record<PropertyKey, unknown>;
				const value = current[prop];
				return typeof value === 'function'
					? (value as (...args: unknown[]) => unknown).bind(current)
					: value;
			},
		});
		this.vueApp.provide(CHAT_TRANSPORT_PORT, reactivePort);
		// WS-3 (REQ-MPS-006) — read-only ProviderRegistry shared with the
		// tabbed `SpecoratorView`. UI imports `useProviderRegistry` rather
		// than reaching for the plugin instance directly.
		this.vueApp.provide(PROVIDER_REGISTRY_KEY, this.plugin.getProviderRegistry());
		this.vueApp.provide(COMMUNITY_PLUGIN_PORT, bridge);
		if (this.plugin.secretStore !== null) {
			this.vueApp.provide(SECRET_STORE_PORT, this.plugin.secretStore);
		}
		if (this._options?.confirmModalAdapter !== undefined) {
			this.vueApp.provide(CONFIRM_MODAL_PORT, this._options.confirmModalAdapter);
		}
		// Top-1 gap from the comparative review: hand markdown rendering to
		// Obsidian's native `MarkdownRenderer` so messages get GFM tables,
		// syntax-highlighted code blocks, math, wikilinks, image embeds,
		// and mermaid. `MarkdownBlock.vue` falls back to a hand-rolled
		// parser when this port is absent (tests / standalone web demo).
		this.vueApp.provide(
			MARKDOWN_RENDER_PORT,
			new ObsidianMarkdownRenderAdapter(this.plugin.app),
		);
		this.vueApp.provide(TRANSPORT_KIND_KEY, this._activeTransportKind);
		this.vueApp.provide(IS_MOBILE_KEY, Platform.isMobile);
		this.vueApp.provide(SETTINGS_VERSION_KEY, this._settingsVersion);
		this.vueApp.provide(OPEN_PLUGIN_SETTINGS_KEY, () => {
			const setting = (
				this.plugin.app as unknown as {
					setting?: { open: () => void; openTabById: (id: string) => void };
				}
			).setting;
			if (setting === undefined) return;
			setting.open();
			setting.openTabById(this.plugin.manifest.id);
		});

		this.vueApp.config.errorHandler = (err, _instance, info) => {
			bridge.error(`[Vue] Unhandled error in ${info}`, err);
			bridge.showError('An unexpected error occurred. Check the console for details.');
		};

		this._onUnhandledRejection = (event: PromiseRejectionEvent) => {
			bridge.error('[Unhandled rejection]', event.reason);
			bridge.showError('An unexpected error occurred. Check the console for details.');
		};
		window.addEventListener('unhandledrejection', this._onUnhandledRejection);

		this.vueApp.mount(mountPoint);
		return Promise.resolve();
	}

	onClose(): Promise<void> {
		if (this._onUnhandledRejection) {
			window.removeEventListener('unhandledrejection', this._onUnhandledRejection);
			this._onUnhandledRejection = null;
		}
		this._statusWatchStop?.();
		this._statusWatchStop = null;
		this._pendingSettingsRefresh = false;
		this.plugin.bridge?.hideAllNotices();
		this.vueApp?.unmount();
		this.vueApp = null;
		this.pinia = null;
		return Promise.resolve();
	}

	/**
	 * Increments the settings-version reactive counter and re-runs the
	 * transport selector unless a chat turn is currently in flight (REQ-ASM-003).
	 * Mid-turn changes are deferred to the chat-status watcher installed in
	 * `onOpen()`.
	 */
	public bumpSettingsVersion(): void {
		this._settingsVersion.value++;
		if (this._isChatLoading()) {
			this._pendingSettingsRefresh = true;
			return;
		}
		this._applyTransportRefresh();
	}

	public _installPendingRefreshWatcher(): void {
		if (this.pinia === null) return;
		if (this._statusWatchStop !== null) return;
		const messagesStore = useMessagesStore(this.pinia);
		this._statusWatchStop = watch(
			() => messagesStore.status,
			(next, prev) => {
				if (prev === 'loading' && next !== 'loading' && this._pendingSettingsRefresh) {
					this._pendingSettingsRefresh = false;
					this._applyTransportRefresh();
				}
			},
			{ flush: 'sync' },
		);
	}

	private _applyTransportRefresh(): void {
		const sdkLifecycle = this._options?.sdkLifecycle;
		if (sdkLifecycle !== undefined) {
			void sdkLifecycle.startup().then(() => {
				this._refreshActivePort();
			});
		}
		const subscriptionLifecycle = this._options?.subscriptionLifecycle;
		if (subscriptionLifecycle !== undefined) {
			void subscriptionLifecycle.startup().then(() => {
				this._refreshActivePort();
			});
		}
		this._refreshActivePort();
	}

	public getActiveClaudeCliPort(): ChatTransportPort {
		return this._activeClaudeCliPort.value;
	}

	public getActiveTransportKind(): TransportKind {
		return this._activeTransportKind.value;
	}

	private _refreshActivePort(): void {
		if (this._options === null) return;
		const selection = this._options.selectTransport(this.plugin.settings);
		if (selection.port !== this._activeClaudeCliPort.value) {
			this._activeClaudeCliPort.value = selection.port;
		}
		if (selection.kind !== this._activeTransportKind.value) {
			this._activeTransportKind.value = selection.kind;
		}
	}

	private _isChatLoading(): boolean {
		if (this.pinia === null) return false;
		const pinia = this.pinia;
		const result = trySync(() => useMessagesStore(pinia).status === 'loading');
		return result.ok ? result.value : false;
	}
}
