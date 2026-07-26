import type { Logger } from '../../core/logging/Logger';
import type { ProviderId } from '../../core/providers/types';
import type { ProviderRecord } from './skills/types';

export interface CachedBucket<E> {
  entries: E[];
  expiresAt: number;
  /**
   * Buckets seeded from a persisted index carry this. They serve the
   * synchronous cold paint but must be revalidated on the first real fetch
   * instead of being trusted for the full TTL — on-disk state can drift while
   * the app is closed. A live fetch always writes a non-stale bucket, so the
   * flag is one-shot.
   */
  stale?: boolean;
}

export interface ProviderEntryAggregatorConfig<E, T> {
  getProviderRecords: () => ProviderRecord[];
  /** The provider listing this aggregator is built on. */
  fetchEntries: (record: ProviderRecord) => Promise<E[]>;
  /** Projects a cached bucket into display rows, re-tagging live provider metadata. */
  mapEntries: (raw: E[], record: ProviderRecord) => T[];
  ttlMs: number;
  nowMs: () => number;
  logger?: Logger;
  /** Prefix for the warn breadcrumbs this aggregator emits. */
  label: string;
  /** Invoked after any successful bucket commit (the skills index persist hook). */
  onBucketCommitted?: () => void;
}

/**
 * Per-provider bucket cache shared by the Quick Actions modal's provider-backed
 * pickers: TTL caching, in-flight deduplication, a generation guard, streaming
 * fan-out, and swallow-and-log failure handling. Subclasses supply the provider
 * listing to read (`fetchEntries`) and the row projection (`mapEntries`); the
 * skills aggregator layers disk persistence and EventBus invalidation on top.
 *
 * Provider metadata (`providerEnabled`, `providerDisplayName`) is re-evaluated
 * from the live `ProviderRecord` on every read, so a provider toggled while the
 * cache is warm is reflected without invalidation.
 */
export abstract class ProviderEntryAggregator<E, T> {
  protected readonly logger?: Logger;
  protected readonly nowMs: () => number;
  private readonly ttlMs: number;
  private readonly cache = new Map<ProviderId, CachedBucket<E>>();
  private readonly inFlight = new Map<ProviderId, Promise<E[]>>();
  /**
   * Per-provider generation guard. Each live fetch claims the provider's slot
   * with a monotonic token; `invalidate()` drops it and a newer fetch replaces
   * it. A fetch commits its result (and releases its in-flight slot) only while
   * it still holds the current token, so a listing already in flight when the
   * data changed can't repopulate the bucket with pre-change data.
   */
  private fetchGeneration = 0;
  private readonly bucketGeneration = new Map<ProviderId, number>();

  protected constructor(private readonly config: ProviderEntryAggregatorConfig<E, T>) {
    this.logger = config.logger?.scope('quickActions');
    this.ttlMs = config.ttlMs;
    this.nowMs = config.nowMs;
  }

  async listAll(): Promise<T[]> {
    const records = this.config.getProviderRecords();
    const buckets = await Promise.all(
      records.map((r) => this.fetchBucket(r).then((raw) => this.config.mapEntries(raw, r))),
    );
    return buckets.flat();
  }

  listCachedNow(): T[] {
    const out: T[] = [];
    for (const record of this.config.getProviderRecords()) {
      const cached = this.cache.get(record.providerId);
      if (!cached) continue;
      out.push(...this.config.mapEntries(cached.entries, record));
    }
    return out;
  }

  async listAllStreaming(
    onProviderResolved: (providerId: ProviderId, entries: T[]) => void,
  ): Promise<void> {
    const records = this.config.getProviderRecords();
    await Promise.all(
      records.map(async (r) => {
        const raw = await this.fetchBucket(r);
        try {
          onProviderResolved(r.providerId, this.config.mapEntries(raw, r));
        } catch (err: unknown) {
          this.logger?.warn(`${this.config.label} stream callback threw`, {
            providerId: r.providerId,
            err,
          });
        }
      }),
    );
  }

  invalidate(providerId?: ProviderId): void {
    if (providerId === undefined) {
      this.clearBuckets();
      return;
    }
    this.cache.delete(providerId);
    this.inFlight.delete(providerId);
    this.bucketGeneration.delete(providerId);
  }

  abstract dispose(): void;

  /** Seeds a needs-revalidation bucket (persisted-index hydration). */
  protected seedStaleBucket(providerId: ProviderId, entries: E[]): void {
    this.cache.set(providerId, {
      entries,
      expiresAt: this.nowMs() + this.ttlMs,
      stale: true,
    });
  }

  /** Snapshot of the raw cached entries, for callers that persist the index. */
  protected snapshotBuckets(): Map<ProviderId, E[]> {
    const out = new Map<ProviderId, E[]>();
    for (const [providerId, bucket] of this.cache) {
      out.set(providerId, bucket.entries);
    }
    return out;
  }

  protected clearBuckets(): void {
    this.cache.clear();
    this.inFlight.clear();
    this.bucketGeneration.clear();
  }

  /** Returns the cached or freshly-fetched raw provider entries. */
  private fetchBucket(record: ProviderRecord): Promise<E[]> {
    const cached = this.cache.get(record.providerId);
    // A `stale` bucket (hydrated from disk) serves the cold paint but forces one
    // revalidation here, so an offline change can't ride the persisted TTL.
    if (cached && !cached.stale && cached.expiresAt > this.nowMs()) {
      return Promise.resolve(cached.entries);
    }
    const existing = this.inFlight.get(record.providerId);
    if (existing) return existing;

    const generation = ++this.fetchGeneration;
    this.bucketGeneration.set(record.providerId, generation);
    const isCurrent = (): boolean =>
      this.bucketGeneration.get(record.providerId) === generation;
    const commit = (entries: E[]): void => {
      if (!isCurrent()) return;
      this.cache.set(record.providerId, {
        entries,
        expiresAt: this.nowMs() + this.ttlMs,
      });
      this.config.onBucketCommitted?.();
    };

    const promise = (async () => {
      try {
        const raw = await this.config.fetchEntries(record);
        commit(raw);
        return raw;
      } catch (err: unknown) {
        this.logger?.warn(`${this.config.label} aggregation failed`, {
          providerId: record.providerId,
          err,
        });
        // Preserve the last-known-good entries — the hydrated bucket being
        // revalidated, or a prior fetch — rather than erasing usable rows (and
        // persisting the empty set) after a transient provider failure. Read the
        // bucket fresh so a concurrent `invalidate()` still wins. A normal
        // (non-`stale`) TTL serves the preserved entries without thrashing
        // retries; it re-fetches on the next cycle.
        const preserved = this.cache.get(record.providerId)?.entries ?? [];
        commit(preserved);
        return preserved;
      } finally {
        // Only release the slot if it's still ours: a superseding fetch may have
        // claimed `inFlight` already, and deleting it would break its dedup.
        if (isCurrent()) this.inFlight.delete(record.providerId);
      }
    })();
    this.inFlight.set(record.providerId, promise);
    return promise;
  }
}
