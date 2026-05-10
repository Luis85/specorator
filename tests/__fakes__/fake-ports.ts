import { vi } from 'vitest'
import { MockBridge } from '@/infrastructure/mock/MockBridge'
import { MockMetadataCacheAdapter } from '@/infrastructure/mock/MockMetadataCacheAdapter'
import { MockCanvasAdapter } from '@/infrastructure/mock/MockCanvasAdapter'
import type {
  SettingsPort,
  VaultPort,
  WorkspacePort,
  NotificationPort,
  LoggerPort,
  TranslationPort,
} from '@/domain/ports'
import { createEventBus } from '@/domain/shared/event-bus'
import type { EventBus } from '@/domain/shared/event-bus'

/**
 * Standard test seam: all five narrow ports (settings/vault/workspace/notifications
 * + logger) backed by a single MockBridge instance, plus a fresh EventBus and a
 * vi.fn() spy LoggerPort, a TranslationPort stub, and W13 mocks (metadataCache,
 * canvas).
 *
 * `bridge` is exposed so tests can inspect recorded notices and opened-file paths.
 * `bus` is exposed so tests can subscribe to events before calling module init.
 * `logger` spies can be asserted on: `ports.logger.warn`, `ports.logger.error`, etc.
 * `metadataCache` and `canvas` are exposed for tests that need those ports.
 */
export interface FakePorts {
  readonly settings: SettingsPort
  readonly vault: VaultPort
  readonly workspace: WorkspacePort
  readonly notifications: NotificationPort
  readonly logger: LoggerPort
  readonly bus: EventBus
  readonly t: TranslationPort
  readonly bridge: MockBridge
  readonly metadataCache: MockMetadataCacheAdapter
  readonly canvas: MockCanvasAdapter
}

export function fakeModulePorts(): FakePorts {
  const bridge = new MockBridge()
  const metadataCache = new MockMetadataCacheAdapter()
  const canvas = new MockCanvasAdapter()
  return {
    settings: bridge,
    vault: bridge,
    workspace: bridge,
    notifications: bridge,
    logger: {
      debug: vi.fn(),
      info:  vi.fn(),
      warn:  vi.fn(),
      error: vi.fn(),
    },
    bus: createEventBus(),
    t: { t: vi.fn((key: string) => key) },
    bridge,
    metadataCache,
    canvas,
  }
}
