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
});
