import type { SettingsPort, VaultPort, WorkspacePort, NotificationPort } from '@/domain/ports'
import type { EventBus } from '@/domain/shared/event-bus'

export interface SettingsFieldDescriptor {
	readonly type: 'toggle' | 'text' | 'number' | 'dropdown'
	readonly key: string
	readonly label: string
	readonly description?: string
	readonly options?: ReadonlyArray<{ readonly value: string; readonly label: string }>
	readonly default: unknown
}

export interface ModuleSettingsSchema {
	readonly fields: ReadonlyArray<SettingsFieldDescriptor>
}

export interface ModuleCommandDescriptor {
	readonly id: string
	readonly name: string
	readonly callback: () => void
}

export interface ModuleViewIntent {
	readonly id: string
	readonly label: string
}

export interface ModulePorts {
	readonly settings: SettingsPort
	readonly vault: VaultPort
	readonly workspace: WorkspacePort
	readonly notifications: NotificationPort
	readonly bus: EventBus
}

export interface ModuleDescriptor<S = Record<string, unknown>> {
	readonly id: string
	readonly dependsOn?: ReadonlyArray<string>
	readonly commands?: ReadonlyArray<ModuleCommandDescriptor>
	readonly views?: ReadonlyArray<ModuleViewIntent>
	readonly settingsSchema?: ModuleSettingsSchema
	/**
	 * Flat locale message maps. Keys are dotted strings, e.g. `'hello.title'`.
	 * W8 may widen this to support nested objects when vue-i18n message merging lands.
	 */
	readonly messages?: Partial<Record<string, Record<string, string>>>
	init(ports: ModulePorts, settings: S): void | Promise<void>
	/**
	 * Invoked by W4 PluginCore when settings change.
	 * NOT called by the W2 provisional bootstrapModules().
	 */
	onSettingsChange?(next: S): void | Promise<void>
	destroy?(): void | Promise<void>
}

export function defineModule<S = Record<string, unknown>>(
	descriptor: ModuleDescriptor<S>,
): ModuleDescriptor<S> {
	return descriptor
}
