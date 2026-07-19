import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MarketplaceItem, MarketplaceManifest } from '@/features/marketplace/catalogTypes';
import type SpecoratorPlugin from '@/main';

// Spy seams for the store's three I/O collaborators, declared via vi.hoisted so
// the (hoisted) vi.mock factories below can reference them. The client-ctor spy
// is what lets us assert the store never even *constructs* a network client when
// the opt-in is off — the check has to sit at the I/O boundary, not only at mount.
const {
  fetchIndexSpy,
  fetchBodySpy,
  clientCtor,
  cacheRead,
  cacheWrite,
  installSpy,
  isInstalledSpy,
  installSkillSpy,
  isSkillInstalledAtSpy,
  refreshCatalogSpy,
} = vi.hoisted(() => ({
  fetchIndexSpy: vi.fn(),
  fetchBodySpy: vi.fn(),
  clientCtor: vi.fn(),
  cacheRead: vi.fn(),
  cacheWrite: vi.fn(),
  installSpy: vi.fn(),
  isInstalledSpy: vi.fn(),
  installSkillSpy: vi.fn(),
  isSkillInstalledAtSpy: vi.fn(),
  refreshCatalogSpy: vi.fn(),
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
  installSkillItem: installSkillSpy,
  isItemInstalled: isInstalledSpy,
  isSkillInstalledAt: isSkillInstalledAtSpy,
  // Faithful stand-in: refreshInstalled uses this to precompute the agent key set
  // (roster ids + catalog ids). Kept real so an agent-item test can't silently
  // fall through the try/catch to an empty set.
  installedAgentKeys: (agents: Array<{ id: string; catalog?: { id?: string } }>) => {
    const keys = new Set<string>();
    for (const agent of agents) {
      keys.add(agent.id);
      if (agent.catalog?.id) keys.add(agent.catalog.id);
    }
    return keys;
  },
}));

vi.mock('@/features/skills/refreshSkillCatalogBestEffort', () => ({
  refreshSkillCatalogBestEffort: refreshCatalogSpy,
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
    events: { emit: vi.fn(), on: vi.fn(() => vi.fn()) },
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
    expect(store.loaded).toBe(true);
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

  it('stamps the committed catalog source into install deps, not the live setting', async () => {
    // Load commits source A; the user then edits the setting to B without a
    // refresh, so the displayed catalog still belongs to A. An install must stamp
    // A (the committed `source.value`) into the agent's provenance — else a later
    // load of B that reuses the id would treat A's agent as B's and hide Install.
    fetchIndexSpy.mockResolvedValue(manifest);
    const p = fakePlugin(true);
    p.settings.marketplaceSourceUrl = 'https://a.example/';
    const store = useMarketplaceStore();
    store.init(p);
    await store.load();
    expect(store.source).toBe('https://a.example/');

    p.settings.marketplaceSourceUrl = 'https://b.example/';
    await store.install(item, 'BODY');
    const deps = installSpy.mock.calls.at(-1)?.[2] as { catalogUrl: string };
    expect(deps.catalogUrl).toBe('https://a.example/');
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
    // An empty-and-errored load stays "not loaded" so a remount can retry.
    expect(store.loaded).toBe(false);
  });

  it('resets loaded when a later refresh empties a previously loaded catalog', async () => {
    const store = useMarketplaceStore();
    store.init(fakePlugin(true));
    await store.load(); // first load succeeds → loaded true
    expect(store.loaded).toBe(true);

    // A later Refresh fails with no matching cache → items cleared. `loaded` must
    // flip back to false (reflect the latest outcome), or a close+reopen would
    // skip the retry and leave the empty error state indefinitely.
    fetchIndexSpy.mockRejectedValue(new Error('network down'));
    cacheRead.mockResolvedValue(null);
    await store.load();
    expect(store.items).toEqual([]);
    expect(store.loaded).toBe(false);
  });

  it('marks loaded after a successful but empty catalog load (reuse, no re-fetch on reopen)', async () => {
    // A valid custom catalog can legitimately have zero items (or all items
    // dropped as malformed). The fetch succeeded, so the catalog is loaded —
    // reopening the view must reuse it, not re-fetch index.json every mount.
    const emptyManifest: MarketplaceManifest = { schemaVersion: 1, catalog: 'x', count: 0, items: [] };
    fetchIndexSpy.mockResolvedValue(emptyManifest);
    const store = useMarketplaceStore();
    store.init(fakePlugin(true));
    await store.load();
    expect(store.items).toEqual([]);
    expect(store.error).toBeNull();
    expect(store.loaded).toBe(true);
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

  it('discards an older installed-scan superseded by a newer one (no reload)', async () => {
    // Since live-sync, external vault/roster events can trigger overlapping
    // refreshInstalled() with NO catalog reload (same generation), so the older
    // scan finishing last must not clobber the newer scan's result.
    const store = useMarketplaceStore();
    store.init(fakePlugin(true));
    await store.load(); // seeds items=[item]; initial scan saw isInstalled=false

    // Scan A parks on its per-item check; scan B resolves at once with installed=true.
    let resolveA: (v: boolean) => void = () => {};
    isInstalledSpy.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveA = resolve;
        }),
    );
    isInstalledSpy.mockResolvedValue(true);

    const scanA = store.refreshInstalled();
    const scanB = store.refreshInstalled();
    await scanB;
    expect(store.installedIds.has('a')).toBe(true);

    // A resolves LAST with a now-stale 'false' — the seq guard must drop its write.
    resolveA(false);
    await scanA;
    expect(store.installedIds.has('a')).toBe(true);
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

describe('marketplaceStore skill install', () => {
  const skillItem: MarketplaceItem = {
    id: 'skills/project-setup',
    type: 'skill',
    name: 'project-setup',
    description: 'd',
    path: 'skills/project-setup/SKILL.md',
    files: [
      'skills/project-setup/SKILL.md',
      'skills/project-setup/references/a.md',
      'skills/project-setup/scripts/setup.mjs',
    ],
    tags: [],
  };

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    installSkillSpy.mockResolvedValue('installed');
    isSkillInstalledAtSpy.mockResolvedValue(false);
    fetchBodySpy.mockResolvedValue('FILE');
    refreshCatalogSpy.mockResolvedValue(undefined);
  });

  it('fetches the supporting files and installs the whole folder at the chosen target', async () => {
    const store = useMarketplaceStore();
    const plugin = fakePlugin(true);
    store.init(plugin);
    const outcome = await store.install(skillItem, 'SKILL BODY', { provider: 'codex', scope: 'user' });
    expect(outcome).toBe('installed');

    // Only the supporting files are fetched — the reviewed SKILL.md body is used verbatim.
    expect(fetchBodySpy).toHaveBeenCalledWith('skills/project-setup/references/a.md');
    expect(fetchBodySpy).toHaveBeenCalledWith('skills/project-setup/scripts/setup.mjs');
    expect(fetchBodySpy).not.toHaveBeenCalledWith('skills/project-setup/SKILL.md');

    // installSkillItem gets an in-skill-relative file map + the target.
    const [passedItem, files, target] = installSkillSpy.mock.calls[0];
    expect(passedItem).toBe(skillItem);
    expect(target).toEqual({ provider: 'codex', scope: 'user' });
    expect(files.get('SKILL.md')).toBe('SKILL BODY');
    expect(files.get('references/a.md')).toBe('FILE');
    expect(files.get('scripts/setup.mjs')).toBe('FILE');
    // The "installed anywhere" badge flips on.
    expect(store.installedIds.has('skills/project-setup')).toBe(true);

    // Skill dot-folders bypass the vault watcher, so a successful install must
    // invalidate the listing caches for the owning provider (aggregator bucket +
    // provider catalog), or the Library/dropdown/run surfaces stay stale for a TTL.
    expect(plugin.events.emit).toHaveBeenCalledWith('vaultSkill.changed', { providerId: 'codex' });
    expect(refreshCatalogSpy).toHaveBeenCalledWith(plugin, 'codex');
  });

  it('does NOT invalidate caches when the skill was already installed (skipped)', async () => {
    installSkillSpy.mockResolvedValue('skipped');
    const store = useMarketplaceStore();
    const plugin = fakePlugin(true);
    store.init(plugin);
    await store.install(skillItem, 'SKILL BODY', { provider: 'claude', scope: 'project' });
    expect(plugin.events.emit).not.toHaveBeenCalled();
    expect(refreshCatalogSpy).not.toHaveBeenCalled();
  });

  it('rejects a skill install with no target', async () => {
    const store = useMarketplaceStore();
    store.init(fakePlugin(true));
    await expect(store.install(skillItem, 'SKILL BODY')).rejects.toThrow(/provider and scope/i);
    expect(installSkillSpy).not.toHaveBeenCalled();
  });

  it('rejects a skill install (and fetches nothing) when the network opt-in is off', async () => {
    const store = useMarketplaceStore();
    store.init(fakePlugin(false));
    await expect(
      store.install(skillItem, 'SKILL BODY', { provider: 'claude', scope: 'project' }),
    ).rejects.toThrow(/disabled/i);
    expect(fetchBodySpy).not.toHaveBeenCalled();
    expect(installSkillSpy).not.toHaveBeenCalled();
  });

  it('isSkillInstalledAt delegates to the installer with the target', async () => {
    isSkillInstalledAtSpy.mockResolvedValue(true);
    const store = useMarketplaceStore();
    store.init(fakePlugin(true));
    expect(await store.isSkillInstalledAt(skillItem, 'cursor', 'project')).toBe(true);
    const [item, target] = isSkillInstalledAtSpy.mock.calls[0];
    expect(item).toBe(skillItem);
    expect(target).toEqual({ provider: 'cursor', scope: 'project' });
  });

  it('refuses a skill with a binary file before fetching or installing anything', async () => {
    const store = useMarketplaceStore();
    store.init(fakePlugin(true));
    const withBinary: MarketplaceItem = {
      ...skillItem,
      files: [...(skillItem.files ?? []), 'skills/project-setup/logo.png'],
    };
    await expect(
      store.install(withBinary, 'SKILL BODY', { provider: 'claude', scope: 'project' }),
    ).rejects.toThrow(/text-only/i);
    expect(fetchBodySpy).not.toHaveBeenCalled();
    expect(installSkillSpy).not.toHaveBeenCalled();
  });
});
