import type { VaultFileAdapter } from '@/core/storage/VaultFileAdapter';
import { MARKETPLACE_CACHE_PATH, MarketplaceCache } from '@/features/marketplace/MarketplaceCache';

function makeAdapter(files: Record<string, string>): VaultFileAdapter {
  return {
    exists: jest.fn(async (p: string) => p in files),
    read: jest.fn(async (p: string) => files[p]),
    writeAtomic: jest.fn(async (p: string, c: string) => {
      files[p] = c;
    }),
  } as unknown as VaultFileAdapter;
}

const manifest = {
  schemaVersion: 1,
  catalog: 'specorator-marketplace',
  count: 1,
  items: [{ id: 'loops/x', type: 'loop', name: 'X', description: 'd', path: 'loops/x.md', tags: [] }],
};

describe('MarketplaceCache', () => {
  it('returns null when the cache is absent', async () => {
    expect(await new MarketplaceCache(makeAdapter({})).read()).toBeNull();
  });

  it('round-trips a written catalog', async () => {
    const files: Record<string, string> = {};
    const cache = new MarketplaceCache(makeAdapter(files));
    await cache.write(manifest as never, 'https://src/', 123);
    expect(files[MARKETPLACE_CACHE_PATH]).toContain('"schemaVersion"');
    const read = await cache.read();
    expect(read?.source).toBe('https://src/');
    expect(read?.fetchedAt).toBe(123);
    expect(read?.manifest.items).toHaveLength(1);
  });

  it('returns null on malformed JSON', async () => {
    const cache = new MarketplaceCache(makeAdapter({ [MARKETPLACE_CACHE_PATH]: 'nope' }));
    expect(await cache.read()).toBeNull();
  });

  it('returns null on a stale cache schema version', async () => {
    const stale = JSON.stringify({ schemaVersion: 99, source: '', fetchedAt: 0, manifest });
    const cache = new MarketplaceCache(makeAdapter({ [MARKETPLACE_CACHE_PATH]: stale }));
    expect(await cache.read()).toBeNull();
  });
});
