import { MockBridge } from '@/infrastructure/mock/MockBridge'
import type {
	SettingsPort,
	VaultPort,
	WorkspacePort,
	NotificationPort,
} from '@/domain/ports'
import { createEventBus } from '@/domain/shared/event-bus'
import type { EventBus } from '@/domain/shared/event-bus'

/**
 * Standard test seam: all four narrow ports backed by a single MockBridge
 * instance, plus a fresh EventBus.
 *
 * `bridge` is exposed so tests can inspect recorded notices and opened-file paths.
 * `bus` is exposed so tests can subscribe to events before calling module init.
 */
export interface FakePorts {
	readonly bridge: MockBridge
	readonly settings: SettingsPort
	readonly vault: VaultPort
	readonly workspace: WorkspacePort
	readonly notifications: NotificationPort
	readonly bus: EventBus
}

export function fakeModulePorts(): FakePorts {
	const bridge = new MockBridge()
	return {
		bridge,
		settings: bridge,
		vault: bridge,
		workspace: bridge,
		notifications: bridge,
		bus: createEventBus(),
	}
}
