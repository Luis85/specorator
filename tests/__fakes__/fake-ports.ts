import { vi } from 'vitest'
import { MockBridge } from '@/infrastructure/mock/MockBridge'
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
 * Standard test seam: all four narrow ports backed by a single MockBridge
 * instance, plus a fresh EventBus and a vi.fn() spy LoggerPort.
 *
 * `bridge` is exposed so tests can inspect recorded notices and opened-file paths.
 * `bus` is exposed so tests can subscribe to events before calling module init.
 * `logger` spies can be asserted on: `ports.logger.warn`, `ports.logger.error`, etc.
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
}

export function fakeModulePorts(): FakePorts {
  const bridge = new MockBridge()
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
  }
}
