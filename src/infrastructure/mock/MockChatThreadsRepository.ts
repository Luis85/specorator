import type { ChatThreadRecord } from '@/domain/chat/ChatThreadRecord'
import type { ChatThreadsRepositoryPort } from '@/domain/ports/ChatThreadsRepositoryPort'

/**
 * In-memory `ChatThreadsRepositoryPort` for unit tests and the standalone
 * browser dev mode. Writes are synchronous and deterministic — there is no
 * debounce, unlike the production `ObsidianChatThreadsRepository` (tests want
 * determinism; SPEC-ASM-001 §9.3).
 *
 * Seed initial state with the `initial` constructor option. Test hooks
 * (`snapshot`, `saveCount`) inspect what has been persisted without going
 * through `load()`.
 */
export class MockChatThreadsRepository implements ChatThreadsRepositoryPort {
  private _records: Map<string, ChatThreadRecord>
  private _saveCount = 0

  constructor(opts: { initial?: ReadonlyMap<string, ChatThreadRecord> | ReadonlyArray<ChatThreadRecord> } = {}) {
    if (opts.initial === undefined) {
      this._records = new Map()
      return
    }
    const initial = opts.initial
    if (Array.isArray(initial)) {
      const entries: Array<[string, ChatThreadRecord]> = (initial as ReadonlyArray<ChatThreadRecord>).map(
        (r) => [r.threadId, r],
      )
      this._records = new Map(entries)
    } else {
      this._records = new Map(initial as ReadonlyMap<string, ChatThreadRecord>)
    }
  }

  async load(): Promise<ReadonlyMap<string, ChatThreadRecord>> {
    // Defensive copy so callers cannot mutate the internal map.
    return new Map(this._records)
  }

  async save(records: ReadonlyMap<string, ChatThreadRecord>): Promise<void> {
    this._records = new Map(records)
    this._saveCount += 1
  }

  /** Test helper: synchronous snapshot of currently-persisted records. */
  snapshot(): ReadonlyMap<string, ChatThreadRecord> {
    return new Map(this._records)
  }

  /** Test helper: count of `save()` calls so coalescing assertions can run. */
  get saveCount(): number {
    return this._saveCount
  }
}
