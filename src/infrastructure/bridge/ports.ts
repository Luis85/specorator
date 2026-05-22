import type { InjectionKey, Ref } from 'vue'
import type {
	SettingsPort,
	VaultPort,
	WorkspacePort,
	NotificationPort,
	LoggerPort,
	MetadataCachePort,
	CanvasPort,
	CommunityPluginPort,
	ChatTransportPort,
	ConfirmModalPort,
	SecretStorePort,
	TransportLifecyclePort,
	IconPort,
} from '@/domain/ports'
import type { MarkdownRenderPort } from '@/domain/ports/MarkdownRenderPort'
import type { TransportKind } from '@/domain/chat/TransportKind'
import type { ProviderRegistry } from '@/domain/chat/ProviderRegistry'

export const SETTINGS_PORT: InjectionKey<SettingsPort> = Symbol('SettingsPort')
export const VAULT_PORT: InjectionKey<VaultPort> = Symbol('VaultPort')
export const WORKSPACE_PORT: InjectionKey<WorkspacePort> = Symbol('WorkspacePort')
export const NOTIFICATION_PORT: InjectionKey<NotificationPort> = Symbol('NotificationPort')
export const LOGGER_PORT: InjectionKey<LoggerPort> = Symbol('LoggerPort')
/**
 * Narrow seam for `obsidian.setIcon` (ADR-AUX-001, REQ-AUX-001). Vue components
 * are forbidden from importing `obsidian` directly, so every icon render goes
 * through this port — production (ObsidianBridge) delegates to
 * `obsidian.setIcon`, while MockBridge / LocalStorageBridge emit a deterministic
 * `<svg data-icon="…"><title>…</title></svg>` placeholder. Sole consumer is
 * `<SpIcon>` (`src/ui/components/primitives/SpIcon.vue`).
 */
export const ICON_PORT: InjectionKey<IconPort> = Symbol('IconPort')
export const METADATA_CACHE_PORT: InjectionKey<MetadataCachePort> = Symbol('MetadataCachePort')
export const CANVAS_PORT: InjectionKey<CanvasPort> = Symbol('CanvasPort')
export const COMMUNITY_PLUGIN_PORT: InjectionKey<CommunityPluginPort> = Symbol('CommunityPluginPort')
export const CHAT_TRANSPORT_PORT: InjectionKey<ChatTransportPort> = Symbol('ChatTransportPort')
/**
 * Read-only metadata table of the v1 (provider, mode) cells (REQ-MPS-006).
 * Built once at plugin startup by `buildProviderRegistry` (WS-3) and
 * provided to the UI via `useProviderRegistry`. Carries `ProviderCapabilities`
 * + labels only — no `ChatTransportPort` or secret material (NFR-MPS-003).
 */
export const PROVIDER_REGISTRY_KEY: InjectionKey<ProviderRegistry> = Symbol('ProviderRegistry')
/**
 * Lifecycle (`startup` / `shutdown`) for the active streaming transport.
 * Split off `ChatTransportPort` in WP-12 (Arch review #3) — see
 * `src/domain/ports/TransportLifecyclePort.ts`. One concrete production caller
 * (`AgentSidepanelView` / `SpecoratorView` settings-bump path); shutdown is
 * driven by `main.ts`'s `register(() => adapter.shutdown())` hook.
 */
export const TRANSPORT_LIFECYCLE_PORT: InjectionKey<TransportLifecyclePort> = Symbol(
	'TransportLifecyclePort',
)
export const CONFIRM_MODAL_PORT: InjectionKey<ConfirmModalPort> = Symbol('ConfirmModalPort')
/**
 * OS-keychain-backed secret store (ADR-008). Production wraps Obsidian's
 * `App.secretStorage` (desktop ≥1.11.4); `available === false` on mobile and
 * older desktop builds. Used by `ChatSidebar` to detect the missing-API-key
 * branch without reading the synced `PluginSettings` blob.
 */
export const SECRET_STORE_PORT: InjectionKey<SecretStorePort> = Symbol('SecretStorePort')
/**
 * Optional `MarkdownRenderPort` provided by the Obsidian view. When
 * present, `MarkdownBlock.vue` delegates rendering to Obsidian's native
 * `MarkdownRenderer.render` (GFM tables, code highlighting, math,
 * wikilinks, mermaid). When absent (tests / standalone web demo),
 * `MarkdownBlock` falls back to the hand-rolled VNode parser.
 */
export const MARKDOWN_RENDER_PORT: InjectionKey<MarkdownRenderPort> = Symbol('MarkdownRenderPort')
/**
 * Reactive transport kind provided by `SpecoratorView` (SPEC-ASM-001 §10.1).
 * Consumed by `ChatSidebar` to drive `TransportStatusPill` and the
 * degraded-state template branches. The value mirrors
 * `selectTransport(settings).kind` and is updated on `bumpSettingsVersion`
 * — but only when `useMessagesStore().status !== 'loading'` (REQ-ASM-003).
 */
export const TRANSPORT_KIND_KEY: InjectionKey<Ref<TransportKind>> = Symbol('TransportKind')
export const IS_MOBILE_KEY: InjectionKey<boolean> = Symbol('IsMobile')
/**
 * Reactive counter provided by SpecoratorView. ChatSidebar watches this to
 * re-check adapter availability after the API key is saved in Settings.
 * Satisfies D-CCS-003, T-CCS-037.
 */
export const SETTINGS_VERSION_KEY: InjectionKey<Ref<number>> = Symbol('settingsVersion')

/**
 * Provided by `SpecoratorView` so `ChatSidebar`'s degraded-state CTA can open
 * Obsidian's plugin settings tab — the only surface that actually exposes the
 * Anthropic API key and transport fields. The in-app Vue `/settings` route
 * does not edit those fields, so routing the recovery CTA there strands users
 * in the first-run / missing-key case (Codex P2, PR #350).
 *
 * The function is provided as a no-op default by callers that do not have
 * access to Obsidian's `App` (unit tests, standalone browser UI), so consumers
 * can call it unconditionally.
 */
export const OPEN_PLUGIN_SETTINGS_KEY: InjectionKey<() => void> = Symbol('openPluginSettings')
