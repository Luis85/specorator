import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MarketplaceItem, MarketplaceManifest } from '@/features/marketplace/catalogTypes';
import type SpecoratorPlugin from '@/main';

// Spy seams for the store's three I/O collaborators, declared via vi.hoisted so
// the (hoisted) vi.mock factories below can reference them. The client-ctor spy
// is what lets us assert the store never even *constructs* a network client when
// the opt-in is off — the check has to sit at the I/O boundary, not only at mount.
const { fetchIndexSpy, fetchBodySpy, clientCtor, cacheRead, cacheWrite, installSpy, isInstalledSpy } =
  vi.hoisted(() => ({
    fetchIndexSpy: vi.fn(),
    fetchBodySpy: vi.fn(),
    clientCtor: vi.fn(),
    cacheRead: vi.fn(),
    cacheWrite: vi.fn(),
    installSpy: vi.fn(),
    isInstalledSpy: vi.fn(),
  }));

// Classes (not arrow factories): the store constructs these with `new`, and an
// arrow function has no [[Construct]].
vi.mock('@/features/marketplace/MarketplaceCatalogClient', async (importOriginal) => {
  // Keep the module's real DEFAULT_MARKETPLACE_BASE_URL / MarketplaceError; only
  // the client class is swapped for a constructable spy.
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    MarketplaceCatalogClient: class {
      fetchIndex = fetchIndexSpy;
      fetchItemBody = fetchBodySpy;
      constructor(base: string) {
        clientCtor(base);
      }
    },
  };
});

vi.mock('@/features/marketplace/MarketplaceCache', () => ({
  MarketplaceCache: class {
    read = cacheRead;
    write = cacheWrite;
  },
}));

vi.mock('@/features/marketplace/MarketplaceInstaller', () => ({
  installMarketplaceItem: installSpy,
  isItemInstalled: isInstalledSpy,
}));

import { DEFAULT_MARKETPLACE_BASE_URL } from '@/features/marketplace/MarketplaceCatalogClient';
import { useMarketplaceStore } from '@/features/marketplace/vue/stores/marketplaceStore';

const item: MarketplaceItem = {
  id: 'a',
  type: 'loop',
  name: 'Alpha',
  description: 'd',
  path: 'loops/alpha.md',
  tags: [],
};
const manifest: MarketplaceManifest = {
  schemaVersion: 1,
  catalog: 'specorator-marketplace',
  count: 1,
  items: [item],
};

function fakePlugin(networkEnabled: boolean): SpecoratorPlugin {
  return {
    settings: {
      marketplaceNetworkEnabled: networkEnabled,
      marketplaceSourceUrl: '',
      agentBoardLoopFolder: 'Agent Board/loops',
      agentBoardTemplateFolder: 'Agent Board/templates',
      quickActionsFolder: 'Quick Actions',
    },
    app: { vault: {} },
    vaultFileAdapter: {},
    agentRosterStore: {},
  } as unknown as SpecoratorPlugin;
}

describe('marketplaceStore network opt-in guard', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    isInstalledSpy.mockResolvedValue(false);
    installSpy.mockResolvedValue('installed');
    fetchIndexSpy.mockResolvedValue(manifest);
    fetchBodySpy.mockResolvedValue('BODY');
    cacheRead.mockResolvedValue(null);
    cacheWrite.mockResolvedValue(undefined);
  });

  it('load() dials the network and caches the manifest when the opt-in is on', async () => {
    const store = useMarketplaceStore();
    store.init(fakePlugin(true));
    await store.load();
    expect(clientCtor).toHaveBeenCalled();
    expect(fetchIndexSpy).toHaveBeenCalled();
    expect(store.items).toEqual([item]);
    expect(store.offline).toBe(false);
    expect(cacheWrite).toHaveBeenCalled();
  });

  it('load() constructs no client and issues no fetch when the opt-in is off; serves cache', async () => {
    cacheRead.mockResolvedValue({
      manifest,
      source: DEFAULT_MARKETPLACE_BASE_URL,
      fetchedAt: 0,
    });
    const store = useMarketplaceStore();
    store.init(fakePlugin(false));
    await store.load();
    expect(fetchIndexSpy).not.toHaveBeenCalled();
    expect(clientCtor).not.toHaveBeenCalled();
    expect(store.offline).toBe(true);
    expect(store.items).toEqual([item]);
  });

  it('fetchBody() rejects and issues no request when the opt-in is off', async () => {
    const store = useMarketplaceStore();
    store.init(fakePlugin(false));
    await expect(store.fetchBody(item)).rejects.toThrow(/disabled/i);
    expect(fetchBodySpy).not.toHaveBeenCalled();
    expect(clientCtor).not.toHaveBeenCalled();
  });

  it('fetchBody fetches from the loaded source, not the live setting', async () => {
    const store = useMarketplaceStore();
    const p = fakePlugin(true);
    p.settings.marketplaceSourceUrl = 'https://a.example/';
    store.init(p);
    await store.load();
    clientCtor.mockClear();
    // The user edits the source in settings but hasn't refreshed the leaf; the
    // displayed items still belong to source A, so their paths must resolve to A.
    p.settings.marketplaceSourceUrl = 'https://b.example/';
    await store.fetchBody(item);
    expect(clientCtor).toHaveBeenCalledWith('https://a.example/');
    expect(clientCtor).not.toHaveBeenCalledWith('https://b.example/');
  });

  it('keeps the old source bound until the reloaded catalog commits', async () => {
    const store = useMarketplaceStore();
    const p = fakePlugin(true);
    p.settings.marketplaceSourceUrl = 'https://a.example/';
    store.init(p);
    await store.load();
    expect(store.source).toBe('https://a.example/');

    // Change the source and refresh, but hold the index fetch open.
    let resolveIndex: (m: typeof manifest) => void = () => {};
    fetchIndexSpy.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveIndex = resolve;
      }),
    );
    p.settings.marketplaceSourceUrl = 'https://b.example/';
    const refreshing = store.load();

    // During the reload the OLD catalog is still shown, so source stays A and a
    // preview still targets A — source flips only when the new items commit.
    expect(store.source).toBe('https://a.example/');
    clientCtor.mockClear();
    await store.fetchBody(item);
    expect(clientCtor).toHaveBeenCalledWith('https://a.example/');

    resolveIndex(manifest);
    await refreshing;
    expect(store.source).toBe('https://b.example/');
  });
});

describe('marketplaceStore install', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    installSpy.mockResolvedValue('installed');
  });

  it('installs the passed (reviewed) body with no network request of its own', async () => {
    const store = useMarketplaceStore();
    store.init(fakePlugin(true));
    const outcome = await store.install(item, 'REVIEWED BODY');
    expect(outcome).toBe('installed');
    expect(installSpy).toHaveBeenCalledWith(
      item,
      'REVIEWED BODY',
      expect.any(Object),
      expect.any(Number),
    );
    // The reviewed body is written verbatim — install never re-fetches.
    expect(fetchBodySpy).not.toHaveBeenCalled();
    expect(clientCtor).not.toHaveBeenCalled();
    expect(store.installedIds.has('a')).toBe(true);
  });

  it('does not optimistically mark installed when the catalog reloaded mid-write', async () => {
    // Hold the install's vault write open until we release it.
    let finishInstall: (v: 'installed') => void = () => {};
    installSpy.mockReturnValue(
      new Promise<'installed'>((resolve) => {
        finishInstall = resolve;
      }),
    );
    isInstalledSpy.mockResolvedValue(false);
    fetchIndexSpy.mockResolvedValue(manifest);
    cacheRead.mockResolvedValue(null);
    cacheWrite.mockResolvedValue(undefined);
    const store = useMarketplaceStore();
    store.init(fakePlugin(true));

    const installing = store.install(item, 'BODY'); // captures the load generation
    await store.load(); // a concurrent reload bumps the generation
    finishInstall('installed');
    await installing;

    // The stale install must NOT re-add the id — load's refreshInstalled owns it.
    expect(store.installedIds.has('a')).toBe(false);
  });

  it('does not mark installed when the install begins during an in-flight reload', async () => {
    // The generation must bump when the new catalog commits, not at load start —
    // otherwise an install that starts mid-reload captures the already-bumped
    // generation and its completion check passes against a replacement catalog.
    let resolveIndex: (m: typeof manifest) => void = () => {};
    let finishInstall: (v: 'installed') => void = () => {};
    fetchIndexSpy.mockReturnValue(
      new Promise((resolve) => {
        resolveIndex = resolve;
      }),
    );
    installSpy.mockReturnValue(
      new Promise((resolve) => {
        finishInstall = resolve;
      }),
    );
    isInstalledSpy.mockResolvedValue(false);
    cacheRead.mockResolvedValue(null);
    cacheWrite.mockResolvedValue(undefined);
    const store = useMarketplaceStore();
    store.init(fakePlugin(true));

    const loading = store.load(); // fetch pending; generation not yet bumped
    const installing = store.install(item, 'BODY'); // captures the pre-commit generation
    resolveIndex(manifest); // load commits: items replaced + generation bumped
    await loading;
    finishInstall('installed');
    await installing;

    expect(store.installedIds.has('a')).toBe(false);
  });
});

describe('marketplaceStore load fallbacks', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    isInstalledSpy.mockResolvedValue(false);
    fetchIndexSpy.mockResolvedValue(manifest);
    cacheRead.mockResolvedValue(null);
    cacheWrite.mockResolvedValue(undefined);
  });

  it('keeps the freshly fetched catalog when the cache write fails', async () => {
    cacheWrite.mockRejectedValue(new Error('disk full'));
    const store = useMarketplaceStore();
    store.init(fakePlugin(true));
    await store.load();
    // A best-effort cache write failure must not discard the online catalog.
    expect(store.items).toEqual([item]);
    expect(store.offline).toBe(false);
    expect(store.error).toBeNull();
  });

  it('falls back to the cache (offline) when an enabled fetch fails for the same source', async () => {
    fetchIndexSpy.mockRejectedValue(new Error('network down'));
    cacheRead.mockResolvedValue({ manifest, source: DEFAULT_MARKETPLACE_BASE_URL, fetchedAt: 0 });
    const store = useMarketplaceStore();
    store.init(fakePlugin(true));
    await store.load();
    expect(store.offline).toBe(true);
    expect(store.items).toEqual([item]);
  });

  it('clears the list and surfaces an error when the cache is for a different source', async () => {
    fetchIndexSpy.mockRejectedValue(new Error('network down'));
    cacheRead.mockResolvedValue({ manifest, source: 'https://other.example/', fetchedAt: 0 });
    const store = useMarketplaceStore();
    store.init(fakePlugin(true));
    await store.load();
    expect(store.items).toEqual([]);
    expect(store.offline).toBe(false);
    expect(store.error).toMatch(/network down/);
  });

  it('discards a stale installed-scan when a concurrent reload commits first', async () => {
    // load()'s finally clears `loading` before awaiting refreshInstalled, so a
    // second load can commit a replacement catalog while the first scan is still
    // running. The first (stale) scan must NOT overwrite installedIds computed
    // from the current catalog when it finishes last.
    const itemA: MarketplaceItem = { id: 'a', type: 'loop', name: 'A', description: 'd', path: 'loops/a.md', tags: [] };
    const itemB: MarketplaceItem = { id: 'b', type: 'loop', name: 'B', description: 'd', path: 'loops/b.md', tags: [] };
    const manifestA: MarketplaceManifest = { schemaVersion: 1, catalog: 'x', count: 1, items: [itemA] };
    const manifestB: MarketplaceManifest = { schemaVersion: 1, catalog: 'x', count: 1, items: [itemB] };

    // Hold the first catalog's installed-scan open; the second resolves at once.
    let releaseAScan: (v: boolean) => void = () => {};
    const aScan = new Promise<boolean>((resolve) => {
      releaseAScan = resolve;
    });
    isInstalledSpy.mockImplementation(async (it: MarketplaceItem) => {
      if (it.id === 'a') return aScan;
      if (it.id === 'b') return true;
      return false;
    });
    fetchIndexSpy.mockResolvedValueOnce(manifestA).mockResolvedValueOnce(manifestB);

    const store = useMarketplaceStore();
    store.init(fakePlugin(true));
    const loadingA = store.load(); // commits catalog A (gen 1), then parks in the A-scan
    // Drain microtasks so load A reaches the paused per-item check (loading now false).
    await new Promise((resolve) => setTimeout(resolve));

    await store.load(); // catalog B commits (gen 2) and its scan marks B installed
    expect(store.installedIds.has('b')).toBe(true);

    releaseAScan(true); // the stale A-scan finishes last, computing { a }
    await loadingA;

    // The generation guard drops A's late write; installedIds still reflects B.
    expect(store.installedIds.has('a')).toBe(false);
    expect(store.installedIds.has('b')).toBe(true);
  });

  it('canonicalizes a non-canonical custom source so the offline cache round-trips', async () => {
    // The client canonicalizes its base URL (lowercase host, strip :443). The
    // store's source key MUST canonicalize identically, or the cache written
    // under the fetched (canonical) source would never match on the offline
    // fallback and every reconnect-then-drop would surface an error instead.
    const canonical = 'https://example.com/base/';
    const store = useMarketplaceStore();
    const p = fakePlugin(true);
    p.settings.marketplaceSourceUrl = 'https://Example.COM:443/base';
    store.init(p);

    await store.load();
    expect(store.source).toBe(canonical);
    expect(clientCtor).toHaveBeenCalledWith(canonical);
    expect(cacheWrite).toHaveBeenCalledWith(manifest, canonical, expect.any(Number));

    // Network drops; the cache stored under the canonical key is found again.
    fetchIndexSpy.mockRejectedValue(new Error('network down'));
    cacheRead.mockResolvedValue({ manifest, source: canonical, fetchedAt: 0 });
    await store.load();
    expect(store.offline).toBe(true);
    expect(store.items).toEqual([item]);
  });
});
