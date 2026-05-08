import type { SettingsPort, VaultPort, WorkspacePort, NotificationPort, LoggerPort, TranslationPort } from '@/domain/ports'
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
	readonly logger: LoggerPort
	readonly bus: EventBus
	readonly t: TranslationPort
}

export interface ModuleDescriptor<S = Record<string, unknown>> {
	readonly id: string
	readonly dependsOn?: ReadonlyArray<string>
	readonly commands?: ReadonlyArray<ModuleCommandDescriptor>
	readonly views?: ReadonlyArray<ModuleViewIntent>
	readonly settingsSchema?: ModuleSettingsSchema
	/** Unique key used to read/write this module's settings slice in the stored blob. Omit if the module has no persistent settings. */
	readonly settingsKey?: string
	/** Current schema version. Migration runs when the stored version is lower. Default: 0. */
	readonly settingsVersion?: number
	/** Fallback returned when migration or validation throws. */
	readonly settingsDefaults?: S
	/**
	 * Flat locale message maps. Keys are dotted strings, e.g. `'hello.title'`.
	 * W8 may widen this to support nested objects when vue-i18n message merging lands.
	 */
	readonly messages?: Partial<Record<string, Record<string, string>>>
	/** Called by PluginCore when storedVersion < settingsVersion. Return the migrated blob. */
	migrate?(fromVersion: number, blob: unknown): unknown
	/** Called after migration (and before onSettingsChange). Must return a valid S or throw. */
	validateSettings?(raw: unknown): S
	init(ports: ModulePorts, settings: S): void | Promise<void>
	/** Invoked by PluginCore after settings are saved with live-edited, validated values. */
	onSettingsChange?(next: S): void | Promise<void>
	destroy?(): void | Promise<void>
}

export function defineModule<S = Record<string, unknown>>(
	descriptor: ModuleDescriptor<S>,
): ModuleDescriptor<S> {
	return descriptor
}
