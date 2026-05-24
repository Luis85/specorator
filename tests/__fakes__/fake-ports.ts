import { vi } from 'vitest';
import { MockBridge } from '@/infrastructure/mock/MockBridge';
import type {
	SettingsPort,
	VaultPort,
	WorkspacePort,
	NotificationPort,
	LoggerPort,
	CommunityPluginPort,
	TranslationPort,
} from '@/domain/ports';
import { createEventBus } from '@/domain/shared/event-bus';
import type { EventBus } from '@/domain/shared/event-bus';

/**
 * Standard test seam (ADR-009): the six core ports backed by a single MockBridge,
 * plus a fresh EventBus, a `vi.fn()` spy LoggerPort, and a TranslationPort stub.
 * P0 reboot — the chat/icon/metadata/canvas fakes were removed with their ports.
 *
 * `bridge` is exposed so tests can inspect recorded notices and opened-file paths.
 */
export interface FakePorts {
	readonly settings: SettingsPort;
	readonly vault: VaultPort;
	readonly workspace: WorkspacePort;
	readonly notifications: NotificationPort;
	readonly logger: LoggerPort;
	readonly communityPluginPort: CommunityPluginPort;
	readonly bus: EventBus;
	readonly t: TranslationPort;
	readonly bridge: MockBridge;
}

export function fakeModulePorts(): FakePorts {
	const bridge = new MockBridge();
	return {
		settings: bridge,
		vault: bridge,
		workspace: bridge,
		notifications: bridge,
		logger: {
			debug: vi.fn(),
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
		},
		communityPluginPort: bridge,
		bus: createEventBus(),
		t: { t: vi.fn((key: string) => key) },
		bridge,
	};
}
