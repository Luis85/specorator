import type { ProviderCommandEntry } from '../../../core/providers/commands/ProviderCommandEntry';
import type { VaultFileAdapter } from '../../../core/storage/VaultFileAdapter';
import { ProviderEntryAggregator } from '../providerEntryAggregator';
import {
  parsePersistedSkillIndex,
  serializePersistedSkillIndex,
} from './skillIndexPersistence';
import type {
  ProviderRecord,
  SkillTabEntry,
  VaultSkillAggregatorOptions,
  VaultSkillSource,
} from './types';

const DEFAULT_TTL_MS = 60_000;
const PERSIST_DEBOUNCE_MS = 1_000;
const DEFAULT_CACHE_PATH = '.specorator/cache/skill-index.json';

/**
 * Walks every provider record returned by the injected factory, asks each
 * provider's `ProviderCommandCatalog.listVaultEntries()` for skill-kind
 * entries, and tags them with provider metadata for the Skills tab.
 *
 * TTL caching, in-flight deduplication, the generation guard, streaming
 * fan-out, and swallow-and-log failure handling live in
 * `ProviderEntryAggregator` (shared with `ProviderCommandAggregator`); this
 * subclass adds the persisted disk index and the `vaultSkill.changed`
 * invalidation seam.
 *
 * When an `eventBus` is supplied, the aggregator subscribes to
 * `vaultSkill.changed` and invalidates the matching provider's bucket so
 * vault edits propagate without a manual refresh. `dispose()` unsubscribes.
 */
export class VaultSkillAggregator
  extends ProviderEntryAggregator<ProviderCommandEntry, SkillTabEntry>
  implements VaultSkillSource {
  private eventBusUnsubscribe: (() => void) | undefined;
  private readonly cacheAdapter?: VaultFileAdapter;
  private readonly cachePath: string;
  private persistTimer: number | null = null;

  constructor(
    getProviderRecords: () => ProviderRecord[],
    options: VaultSkillAggregatorOptions = {},
  ) {
    super({
      getProviderRecords,
      label: 'vault skill',
      ttlMs: options.ttlMs ?? DEFAULT_TTL_MS,
      nowMs: options.nowMs ?? Date.now,
      ...(options.logger ? { logger: options.logger } : {}),
      fetchEntries: async (record) => {
        const all = await record.commandCatalog.listVaultEntries();
        return all.filter((e) => e.kind === 'skill');
      },
      mapEntries: (raw, record) => mapSkillBucket(raw, record),
      onBucketCommitted: () => this.schedulePersist(),
    });
    if (options.eventBus) {
      this.eventBusUnsubscribe = options.eventBus.on(
        'vaultSkill.changed',
        ({ providerId }) => this.invalidate(providerId),
      );
    }
    this.cacheAdapter = options.cacheAdapter;
    this.cachePath = options.cachePath ?? DEFAULT_CACHE_PATH;
  }

  /**
   * Populates the in-memory cache from the persisted skill index on disk.
   *
   * No-ops when no `cacheAdapter` was supplied or when the cache file does
   * not exist. When the file is present but the contents are malformed or
   * the schema version does not match, the failure is swallowed and a
   * `warn` breadcrumb is emitted; callers continue with a cold cache.
   *
   * Hydrated buckets are seeded `stale`: they back the synchronous first
   * paint (`listCachedNow`) but are NOT trusted for the TTL. On-disk and
   * enablement state can drift while Obsidian is closed — a plugin disabled
   * via the CLI, a skill added or deleted — so the onload prewarm (or the
   * first `listAll`/`listAllStreaming`) re-scans and replaces them within an
   * instant-paint beat instead of showing the persisted set for ~60s. This is
   * scope-agnostic: vault, user, and plugin skills all revalidate.
   */
  async hydrate(): Promise<void> {
    if (!this.cacheAdapter) return;
    try {
      if (!(await this.cacheAdapter.exists(this.cachePath))) return;
      const raw = await this.cacheAdapter.read(this.cachePath);
      const buckets = parsePersistedSkillIndex(raw);
      if (!buckets) {
        this.logger?.warn('skill index hydrate skipped: malformed or schema mismatch');
        return;
      }
      for (const [providerId, entries] of buckets) {
        this.seedStaleBucket(providerId, entries);
      }
    } catch (err: unknown) {
      this.logger?.warn('skill index hydrate failed', { err });
    }
  }

  dispose(): void {
    if (this.persistTimer !== null) {
      window.clearTimeout(this.persistTimer);
      this.persistTimer = null;
      // Snapshot built synchronously before any await — safe to clear cache afterwards.
      void this.flushPersist();
    }
    this.eventBusUnsubscribe?.();
    this.eventBusUnsubscribe = undefined;
    this.clearBuckets();
  }

  /** Trailing-edge debounce: collapse near-simultaneous fetches into a single write. */
  private schedulePersist(): void {
    if (!this.cacheAdapter) return;
    if (this.persistTimer !== null) window.clearTimeout(this.persistTimer);
    this.persistTimer = window.setTimeout(() => {
      this.persistTimer = null;
      void this.flushPersist();
    }, PERSIST_DEBOUNCE_MS);
  }

  /** Snapshot the in-memory cache and write the index. Failures logged at warn; never throws. */
  private async flushPersist(): Promise<void> {
    if (!this.cacheAdapter) return;
    const body = serializePersistedSkillIndex(this.snapshotBuckets(), this.nowMs());
    try {
      await this.cacheAdapter.write(this.cachePath, body);
    } catch (err: unknown) {
      this.logger?.warn('skill index persist failed', { err });
    }
  }
}

function mapSkillBucket(
  raw: ProviderCommandEntry[],
  record: ProviderRecord,
): SkillTabEntry[] {
  return raw
    .map((entry) => mapSkillEntry(entry, record))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function mapSkillEntry(
  entry: ProviderCommandEntry,
  record: ProviderRecord,
): SkillTabEntry {
  const prefix: '/' | '$' = entry.insertPrefix === '$' ? '$' : '/';
  return {
    id: `${record.providerId}:${entry.id}`,
    providerId: record.providerId,
    providerDisplayName: record.displayName,
    name: entry.name,
    description: entry.description ?? '',
    insertPrefix: prefix,
    sourceFilePath: entry.sourceFilePath ?? null,
    scope: entry.scope,
    providerEnabled: record.isEnabled,
  };
}
