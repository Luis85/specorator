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
} from '@/infrastructure/bridge/ports';
import type SpecoratorPlugin from './main';

/** The single view type the plugin registers (SPEC-PSR-005). */
export const VIEW_TYPE_AGENT = 'specorator-agent';

/**
 * The agent chat sidebar (P1 chat-core — SPEC-CC-022). Mounts `ChatSurface`
 * inside `ErrorBoundary` (so component errors route through LoggerPort +
 * NotificationPort), installs Pinia + i18n, and provides the six core ports plus
 * the two chat ports — `CHAT_RUNTIME_PORT` from `bridge.createChatRuntime()` (one
 * fresh runtime per mounted view) and `MARKDOWN_RENDER_PORT` from the bridge's
 * markdown port. `onClose` unmounts the app, whose `ChatSurface.onBeforeUnmount`
 * cancels the in-flight turn + resets the store before teardown (EC-15). The tab
 * icon is a native Lucide name (`bot`), not routed through a (deleted) IconPort.
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
}
