/**
 * Persists the last-fetched marketplace catalog under `.specorator/cache/` so
 * the Marketplace view is browsable offline (read-only, last-known list) after
 * the first successful fetch. Schema-versioned and cold-cache-safe (malformed or
 * version-mismatched cache reads as absent), mirroring the skill-index cache.
 */
import type { VaultFileAdapter } from '../../core/storage/VaultFileAdapter';
import { type MarketplaceManifest, parseManifest } from './catalogTypes';

export const MARKETPLACE_CACHE_PATH = '.specorator/cache/marketplace-index.json';
const CACHE_SCHEMA_VERSION = 1;

export interface CachedCatalog {
  /** Base URL the catalog was fetched from (so a source change invalidates). */
  source: string;
  fetchedAt: number;
  manifest: MarketplaceManifest;
}

interface PersistedCatalog extends CachedCatalog {
  schemaVersion: number;
}

export class MarketplaceCache {
  constructor(
    private readonly adapter: VaultFileAdapter,
    private readonly path: string = MARKETPLACE_CACHE_PATH,
  ) {}

  /** Returns the cached catalog, or null when missing/malformed/stale-schema. */
  async read(): Promise<CachedCatalog | null> {
    let raw: string;
    try {
      if (!(await this.adapter.exists(this.path))) return null;
      raw = await this.adapter.read(this.path);
    } catch {
      return null;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    if (typeof parsed !== 'object' || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    if (record.schemaVersion !== CACHE_SCHEMA_VERSION) return null;
    const manifest = parseManifest(record.manifest);
    if (!manifest) return null;
    return {
      source: typeof record.source === 'string' ? record.source : '',
      fetchedAt: typeof record.fetchedAt === 'number' ? record.fetchedAt : 0,
      manifest,
    };
  }

  /** Atomically writes the catalog to the cache (caller supplies `fetchedAt`). */
  async write(manifest: MarketplaceManifest, source: string, fetchedAt: number): Promise<void> {
    const payload: PersistedCatalog = { schemaVersion: CACHE_SCHEMA_VERSION, source, fetchedAt, manifest };
    await this.adapter.writeAtomic(this.path, JSON.stringify(payload, null, 2));
  }
}
