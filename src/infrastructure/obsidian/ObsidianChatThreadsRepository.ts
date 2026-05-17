import type { ChatThreadRecord } from '@/domain/chat/ChatThreadRecord'
import type { ChatThreadsRepositoryPort } from '@/domain/ports/ChatThreadsRepositoryPort'
import type { LoggerPort } from '@/domain/ports/LoggerPort'
import {
  decodeChatThreadsBlob,
  encodeChatThreadsBlob,
} from '@/infrastructure/chat/chatThreadsCodec'

/**
 * Minimal contract this adapter expects from the host Obsidian plugin. We do
 * NOT depend on the concrete `Plugin` class to keep the adapter testable
 * outside the Obsidian runtime; the host wires the three callbacks at
 * construction time. See `src/plugin/main.ts` for the production wiring.
 *
 * - `loadData()` reads the raw plugin-data blob (everything stored under
 *   `data.json`). May be `null` on first load.
 * - `saveData(data)` writes the full blob back to disk (Obsidian's atomic
 *   write).
 * - `setActiveTimeout` / `clearActiveTimeout` route through Obsidian's
 *   `activeWindow.{setTimeout,clearTimeout}` so popout windows get correct
 *   timing semantics. In tests we route through `globalThis.setTimeout`.
 */
export interface ObsidianPluginDataHost {
  loadData(): Promise<unknown>
  saveData(data: Record<string, unknown>): Promise<void>
  setActiveTimeout(cb: () => void, ms: number): number
  clearActiveTimeout(id: number): void
}

/**
 * Production `ChatThreadsRepositoryPort` adapter (WP-14). Lifts the
 * persistence side-channel that previously lived on
 * `SpecoratorPlugin.scheduleChatThreadsPersistence` (`src/plugin/main.ts`)
 * into a narrow port adapter the views consume directly.
 *
 * Behaviour preserved from the prior implementation:
 *   - Reads `_storedData.specorator.chatThreads` and decodes via
 *     `decodeChatThreadsBlob` — malformed records are dropped and logged at
 *     `warn` (SPEC §11.3).
 *   - Writes coalesce via a 1 s trailing-edge debounce (OQ-ASM-T1) so rapid
 *     streaming mutations do not thrash disk.
 *   - Writes preserve every sibling key under `_storedData.specorator`
 *     (SPEC §9.3 coexistence guarantee — PluginSettings keys, per-module
 *     blobs, etc. survive a `save()`).
 *   - Flushes are serialised via a tail-chained queue so an older snapshot
 *     can never resolve after a newer one (Codex P1, PR #350).
 *   - `flushPending()` performs a final synchronous flush of the most
 *     recently scheduled snapshot — called from `Plugin.onunload()` so
 *     messages sent inside the debounce window survive plugin reload.
 *
 * Satisfies REQ-ASM-037, SPEC-ASM-001 §9.3, ADR-0031.
 */
export class ObsidianChatThreadsRepository implements ChatThreadsRepositoryPort {
  /** Default debounce window in milliseconds for `save()` flushes. */
  static readonly DEFAULT_DEBOUNCE_MS = 1_000

  private _flushTimer: number | null = null
  private _pendingSnapshot: ReadonlyMap<string, ChatThreadRecord> | null = null
  private _flushQueue: Promise<void> = Promise.resolve()
  private readonly _debounceMs: number

  constructor(
    private readonly host: ObsidianPluginDataHost,
    private readonly logger: LoggerPort,
    opts: { debounceMs?: number } = {},
  ) {
    this._debounceMs = opts.debounceMs ?? ObsidianChatThreadsRepository.DEFAULT_DEBOUNCE_MS
  }

  async load(): Promise<ReadonlyMap<string, ChatThreadRecord>> {
    const stored = (await this.host.loadData()) as Record<string, unknown> | null
    if (stored === null || typeof stored !== 'object') return new Map()
    const specoratorBlob = (stored.specorator ?? {}) as Record<string, unknown>
    const chatThreadsBlob = specoratorBlob.chatThreads
    const records = decodeChatThreadsBlob(chatThreadsBlob, this.logger)
    return new Map(records.map((r) => [r.threadId, r]))
  }

  /**
   * Schedule a debounced flush of `records`. Resolves immediately once the
   * snapshot is captured; the actual write happens after the debounce
   * elapses. Use `flushPending()` to force-flush before plugin teardown.
   */
  async save(records: ReadonlyMap<string, ChatThreadRecord>): Promise<void> {
    const snapshot = new Map(records)
    this._pendingSnapshot = snapshot
    if (this._flushTimer !== null) {
      this.host.clearActiveTimeout(this._flushTimer)
    }
    this._flushTimer = this.host.setActiveTimeout(() => {
      this._flushTimer = null
      this._pendingSnapshot = null
      // Serialise via the tail-chained queue so older snapshots can never
      // resolve after newer ones (Codex P1, PR #350). `.catch(() => undefined)`
      // keeps the chain alive past a transient saveData failure.
      this._flushQueue = this._flushQueue
        .catch(() => undefined)
        .then(() => this._flushChatThreads(snapshot))
      void this._flushQueue
    }, this._debounceMs)
  }

  /**
   * Cancel any pending debounce and synchronously chain the latest pending
   * snapshot onto the flush queue. Returns the queue tail so callers may
   * `await` it (e.g. test code); production `onunload()` is fire-and-forget.
   *
   * No-op when no flush is pending. Codex P1 (PR #346): a message sent
   * within the debounce window must persist even if Obsidian exits or the
   * plugin is disabled before the timer fires.
   */
  flushPending(): Promise<void> {
    if (this._flushTimer !== null) {
      this.host.clearActiveTimeout(this._flushTimer)
      this._flushTimer = null
    }
    if (this._pendingSnapshot === null) return this._flushQueue
    const snapshot = this._pendingSnapshot
    this._pendingSnapshot = null
    this._flushQueue = this._flushQueue
      .catch(() => undefined)
      .then(() => this._flushChatThreads(snapshot))
    return this._flushQueue
  }

  /**
   * Internal: write the encoded `chatThreads` blob into the stored data
   * while preserving every other sibling key under `specorator` (SPEC §9.3).
   * Re-reads `loadData()` at flush time so concurrent settings writes from
   * other code paths are not lost.
   */
  private async _flushChatThreads(
    records: ReadonlyMap<string, ChatThreadRecord>,
  ): Promise<void> {
    const encoded = encodeChatThreadsBlob(records)
    const stored = ((await this.host.loadData()) as Record<string, unknown> | null) ?? {}
    const currentSpecorator = (stored.specorator ?? {}) as Record<string, unknown>
    const nextSpecorator = { ...currentSpecorator, chatThreads: encoded }
    const nextStored: Record<string, unknown> = { ...stored, specorator: nextSpecorator }
    await this.host.saveData(nextStored)
  }
}
