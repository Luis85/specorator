import type { SessionId } from './SessionId'

/**
 * Persistent record describing a single chat thread (SPEC-ASM-001 §2.2).
 * Stored under `_storedData.specorator.chatThreads` (SPEC §9.3) and keyed by
 * `threadId`.
 *
 * Satisfies REQ-ASM-031, REQ-ASM-035, REQ-ASM-037.
 *
 * Domain layer (ADR-008): no `obsidian` / `child_process` imports.
 */
export interface ChatThreadRecord {
  /** Plugin-generated UUID v4. Stable for the lifetime of the thread. */
  readonly threadId: string

  /**
   * Subscription-transport session id captured from `system/init`.
   * `null` until the first `system/init` event arrives, or for SDK threads
   * where the concept does not apply.
   */
  readonly sessionId: SessionId | null

  /** Active feature slug at thread creation, or `null` if none. */
  readonly feature: string | null

  /** Vault-relative path to this thread's session log. */
  readonly logPath: string

  /** Transport used by the thread. `'degraded'` threads are not persisted. */
  readonly transport: 'api-key' | 'subscription'

  /** ISO 8601 UTC timestamp of thread creation. */
  readonly createdAt: string

  /** ISO 8601 UTC timestamp of the last user turn on the thread. */
  readonly lastUsedAt: string
}
