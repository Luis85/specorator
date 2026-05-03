import type { InjectionKey } from 'vue'
import type {
	SettingsPort,
	VaultPort,
	WorkspacePort,
	NotificationPort,
} from '@/domain/ports'

export const SETTINGS_PORT: InjectionKey<SettingsPort> = Symbol('SettingsPort')
export const VAULT_PORT: InjectionKey<VaultPort> = Symbol('VaultPort')
export const WORKSPACE_PORT: InjectionKey<WorkspacePort> = Symbol('WorkspacePort')
export const NOTIFICATION_PORT: InjectionKey<NotificationPort> = Symbol('NotificationPort')
