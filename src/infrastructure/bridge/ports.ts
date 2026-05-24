import type { InjectionKey } from 'vue';
import type {
	SettingsPort,
	VaultPort,
	WorkspacePort,
	NotificationPort,
	LoggerPort,
	CommunityPluginPort,
} from '@/domain/ports';

/**
 * Per-port InjectionKeys (ADR-008). P0 reboot (SPEC-PSR-009): only the six core
 * ports remain. The chat/MCP/canvas/icon/secret InjectionKeys were deleted with
 * their subsystems and regrow per consumer in a later phase.
 */
export const SETTINGS_PORT: InjectionKey<SettingsPort> = Symbol('SettingsPort');
export const VAULT_PORT: InjectionKey<VaultPort> = Symbol('VaultPort');
export const WORKSPACE_PORT: InjectionKey<WorkspacePort> = Symbol('WorkspacePort');
export const NOTIFICATION_PORT: InjectionKey<NotificationPort> = Symbol('NotificationPort');
export const LOGGER_PORT: InjectionKey<LoggerPort> = Symbol('LoggerPort');
export const COMMUNITY_PLUGIN_PORT: InjectionKey<CommunityPluginPort> =
	Symbol('CommunityPluginPort');
