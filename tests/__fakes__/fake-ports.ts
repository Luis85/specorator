import { MockBridge } from '@/infrastructure/mock/MockBridge'
import type {
	SettingsPort,
	VaultPort,
	WorkspacePort,
	NotificationPort,
} from '@/domain/ports'

/**
 * Standard test seam: all four narrow ports backed by a single MockBridge
 * instance. `bridge` is exposed so tests can read recorded notices and
 * opened-file paths via MockBridge's spy methods.
 *
 * Per-method overrides are not parameterised (YAGNI). Callers that need to
 * override one method should construct their own scenario inline; if the
 * pattern recurs, add an `overrides` parameter then.
 */
export interface FakePorts {
	readonly bridge: MockBridge
	readonly settings: SettingsPort
	readonly vault: VaultPort
	readonly workspace: WorkspacePort
	readonly notifications: NotificationPort
}

export function fakeModulePorts(): FakePorts {
	const bridge = new MockBridge()
	return {
		bridge,
		settings: bridge,
		vault: bridge,
		workspace: bridge,
		notifications: bridge,
	}
}
