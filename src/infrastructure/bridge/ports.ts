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
	ClaudeCliPort,
	ConfirmModalPort,
} from '@/domain/ports'

export const SETTINGS_PORT: InjectionKey<SettingsPort> = Symbol('SettingsPort')
export const VAULT_PORT: InjectionKey<VaultPort> = Symbol('VaultPort')
export const WORKSPACE_PORT: InjectionKey<WorkspacePort> = Symbol('WorkspacePort')
export const NOTIFICATION_PORT: InjectionKey<NotificationPort> = Symbol('NotificationPort')
export const LOGGER_PORT: InjectionKey<LoggerPort> = Symbol('LoggerPort')
export const METADATA_CACHE_PORT: InjectionKey<MetadataCachePort> = Symbol('MetadataCachePort')
export const CANVAS_PORT: InjectionKey<CanvasPort> = Symbol('CanvasPort')
export const COMMUNITY_PLUGIN_PORT: InjectionKey<CommunityPluginPort> = Symbol('CommunityPluginPort')
export const CLAUDE_CLI_PORT: InjectionKey<ClaudeCliPort> = Symbol('ClaudeCliPort')
export const CONFIRM_MODAL_PORT: InjectionKey<ConfirmModalPort> = Symbol('ConfirmModalPort')
export const IS_MOBILE_KEY: InjectionKey<boolean> = Symbol('IsMobile')
/**
 * Reactive counter provided by SpecoratorView. ChatSidebar watches this to
 * re-check adapter availability after the API key is saved in Settings.
 * Satisfies D-CCS-003, T-CCS-037.
 */
export const SETTINGS_VERSION_KEY: InjectionKey<Ref<number>> = Symbol('settingsVersion')
