import type { SessionId } from './SessionId'
import type { ProviderId, ProviderMode } from './ProviderSelection'

/**
 * Persistent record describing a single chat thread.
 *
 * Originally specified by SPEC-ASM-001 §2.2; extended by SPEC-MPS-001 §2.6
 * (REQ-MPS-005, REQ-MPS-020, REQ-MPS-021, REQ-MPS-023):
 *
 * - `transport` becomes a discriminated `{ provider, mode }` object so
 *   threads carry the provider axis explicitly (no more
 *   `'api-key' | 'subscription'` string conflation).
 * - `title` carries a user-facing thread name; `''` until the first
 *   message is sent or the user renames the thread.
 * - `forkParent` is the source thread id when the thread was forked from
 *   another conversation; `null` for fresh threads.
 *
 * Stored under `_storedData.specorator.chatThreads` (SPEC-ASM-001 §9.3) and
 * keyed by `threadId`. Persistence translates legacy string `transport`
 * values to the new object shape via `migrateProviderSelection`
 * (`src/application/migration/migrateProviderSelection.ts`).
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

  /**
   * Transport used by the thread. Replaces the legacy
   * `'api-key' | 'subscription'` string union (REQ-MPS-005). `'degraded'`
   * threads are not persisted, so neither `provider` nor `mode` carries a
   * "degraded" marker — the persistence boundary filters those records out.
   */
  readonly transport: {
    readonly provider: ProviderId
    readonly mode: ProviderMode
  }

  /**
   * User-facing thread title. Defaults to `''` until the first user message
   * is sent or the user renames the thread (REQ-MPS-020).
   */
  readonly title: string

  /**
   * `threadId` of the source thread when this thread was forked, or `null`
   * for fresh threads (REQ-MPS-021).
   */
  readonly forkParent: string | null

  /** ISO 8601 UTC timestamp of thread creation. */
  readonly createdAt: string

  /** ISO 8601 UTC timestamp of the last user turn on the thread. */
  readonly lastUsedAt: string
}
