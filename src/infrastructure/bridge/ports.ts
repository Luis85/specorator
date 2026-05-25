import type { InjectionKey } from 'vue';
import type {
	SettingsPort,
	VaultPort,
	WorkspacePort,
	NotificationPort,
	LoggerPort,
	CommunityPluginPort,
	ChatRuntimePort,
	MarkdownRenderPort,
	IconPort,
	ProviderHistoryPort,
} from '@/domain/ports';

/**
 * Per-port InjectionKeys (ADR-008). P0 reboot (SPEC-PSR-009): the six core
 * ports. P1 chat-core (SPEC-CC-008) regrows two more — `CHAT_RUNTIME_PORT` and
 * `MARKDOWN_RENDER_PORT` — alongside them. There is no aggregate key: each port
 * is injected on its own (ADR-CC-001 §5). P2 rich-rendering (SPEC-RR-009)
 * regrows the icon seam — `ICON_PORT` joins the list below (still no aggregate).
 * The remaining MCP/canvas/secret InjectionKeys stay deleted and regrow per
 * consumer in a later phase.
 */
export const SETTINGS_PORT: InjectionKey<SettingsPort> = Symbol('SettingsPort');
export const VAULT_PORT: InjectionKey<VaultPort> = Symbol('VaultPort');
export const WORKSPACE_PORT: InjectionKey<WorkspacePort> = Symbol('WorkspacePort');
export const NOTIFICATION_PORT: InjectionKey<NotificationPort> = Symbol('NotificationPort');
export const LOGGER_PORT: InjectionKey<LoggerPort> = Symbol('LoggerPort');
export const COMMUNITY_PLUGIN_PORT: InjectionKey<CommunityPluginPort> =
	Symbol('CommunityPluginPort');

// P1 chat-core ports (SPEC-CC-008, REQ-CC-002, REQ-CC-015).
export const CHAT_RUNTIME_PORT: InjectionKey<ChatRuntimePort> = Symbol('ChatRuntimePort');
export const MARKDOWN_RENDER_PORT: InjectionKey<MarkdownRenderPort> = Symbol('MarkdownRenderPort');

// P2 rich-rendering icon seam (SPEC-RR-009, ADR-RR-001 §4, T-RR-007).
export const ICON_PORT: InjectionKey<IconPort> = Symbol('IconPort');

// P3 threads-sessions history seam (SPEC-TS-001, ADR-TS-001 §2). Own key, no
// aggregate — injected on its own per ADR-008/ADR-CC-001 §5.
export const PROVIDER_HISTORY_PORT: InjectionKey<ProviderHistoryPort> =
	Symbol('ProviderHistoryPort');
