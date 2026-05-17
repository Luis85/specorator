import type { ChatThreadRecord } from '@/domain/chat/ChatThreadRecord'

/**
 * Narrow port (ADR-008) for persistence of the `chatThreads` map
 * (SPEC-ASM-001 §9.3, REQ-ASM-037).
 *
 * `load()` returns the rehydrated set of records (malformed entries already
 * filtered out and logged at `warn` by the adapter — see
 * `src/infrastructure/chat/chatThreadsCodec.ts`). `save()` accepts an
 * in-memory snapshot and persists it; production adapters debounce internally
 * to coalesce rapid mutations (OQ-ASM-T1).
 *
 * Domain layer (ADR-008): no `obsidian` imports. The two methods are the
 * full contract — no read/write or list methods leak in.
 */
export interface ChatThreadsRepositoryPort {
  /**
   * Read the persisted `chatThreads` blob and return it as a
   * `Map<threadId, ChatThreadRecord>`. Malformed records are dropped at decode
   * time (SPEC §11.3). Returns an empty map on first load.
   */
  load(): Promise<ReadonlyMap<string, ChatThreadRecord>>

  /**
   * Persist the in-memory `chatThreads` map. Production adapters debounce
   * (see `ObsidianChatThreadsRepository.save`); the mock adapter writes
   * synchronously for test determinism. `'degraded'`-transport records are
   * filtered at encode time (SPEC §2.2, ADR-0031).
   */
  save(records: ReadonlyMap<string, ChatThreadRecord>): Promise<void>
}
