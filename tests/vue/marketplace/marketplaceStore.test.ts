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
  installsUserScopeSpy,
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
  installsUserScopeSpy: vi.fn(),
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

// Only the user-scope install-capability check is needed from ProviderRegistry here.
vi.mock('@/core/providers/ProviderRegistry', () => ({
  ProviderRegistry: { installsUserScopeSkills: installsUserScopeSpy },
}));

import { MAX_SKILL_FILES } from '@/features/marketplace/catalogTypes';
import { DEFAULT_MARKETPLACE_BASE_URL } from '@/features/marketplace/MarketplaceCatalogClient';
import { MAX_SKILL_FILE_CHARS, MAX_SKILL_TOTAL_CHARS } from '@/features/marketplace/skillFileFetch';
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

  // The install re-fetches SKILL.md to verify it still matches the reviewed body
  // (item 10 revision guard). Wire fetchItemBody so the marker re-fetch returns the
  // reviewed body and supporting files return `supporting`, so a happy-path install
  // doesn't trip the drift guard.
  function mockSkillSource(reviewedMarker: string, supporting = 'FILE'): void {
    fetchBodySpy.mockImplementation(async (repoPath: string) =>
      repoPath === skillItem.path ? reviewedMarker : supporting,
    );
  }

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    installSkillSpy.mockResolvedValue('installed');
    isSkillInstalledAtSpy.mockResolvedValue(false);
    fetchBodySpy.mockResolvedValue('FILE');
    refreshCatalogSpy.mockResolvedValue(undefined);
    installsUserScopeSpy.mockReturnValue(true); // capability present unless a test says otherwise
  });

  it('fetches the supporting files and installs the whole folder at the chosen target', async () => {
    const store = useMarketplaceStore();
    const plugin = fakePlugin(true);
    store.init(plugin);
    mockSkillSource('SKILL BODY');
    const outcome = await store.install(skillItem, 'SKILL BODY', { provider: 'codex', scope: 'user' });
    expect(outcome).toBe('installed');

    // Supporting files are fetched, and the marker is re-fetched to verify it hasn't
    // drifted since preview — but the reviewed SKILL.md body is what gets written.
    expect(fetchBodySpy).toHaveBeenCalledWith('skills/project-setup/references/a.md');
    expect(fetchBodySpy).toHaveBeenCalledWith('skills/project-setup/scripts/setup.mjs');
    expect(fetchBodySpy).toHaveBeenCalledWith('skills/project-setup/SKILL.md');

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

  it('forces the provider catalog refresh BEFORE emitting vaultSkill.changed on install', async () => {
    // Codex's refresh spawns an ephemeral app-server (slow); if the event fired
    // first, a racing reload (the Library live-refresh subscribes to the same
    // bus) would re-fetch the pre-refresh listing and cache it for the TTL.
    const store = useMarketplaceStore();
    const plugin = fakePlugin(true);
    store.init(plugin);
    mockSkillSource('SKILL BODY');
    const order: string[] = [];
    refreshCatalogSpy.mockImplementation(async () => { order.push('refresh'); });
    vi.mocked(plugin.events.emit).mockImplementation((name: string) => {
      if (name === 'vaultSkill.changed') order.push('emit');
    });
    await store.install(skillItem, 'SKILL BODY', { provider: 'codex', scope: 'user' });
    expect(order).toEqual(['refresh', 'emit']);
  });

  it('aborts (writes nothing) when the marker drifted in the catalog since preview', async () => {
    const store = useMarketplaceStore();
    store.init(fakePlugin(true));
    // The reviewed body is 'SKILL BODY', but the marker re-fetched at install time
    // comes back changed — a catalog bump landed between preview and install, so the
    // supporting files just fetched could be from a newer revision than the marker.
    mockSkillSource('SKILL BODY CHANGED');
    await expect(
      store.install(skillItem, 'SKILL BODY', { provider: 'claude', scope: 'project' }),
    ).rejects.toThrow(/changed in the catalog|review it again/i);
    // The whole install is refused rather than landing a hybrid skill.
    expect(installSkillSpy).not.toHaveBeenCalled();
  });

  it('installs a marker-only skill without re-fetching the marker (no supporting files)', async () => {
    const markerOnly: MarketplaceItem = { ...skillItem, files: ['skills/project-setup/SKILL.md'] };
    const store = useMarketplaceStore();
    store.init(fakePlugin(true));
    const outcome = await store.install(markerOnly, 'SKILL BODY', { provider: 'claude', scope: 'project' });
    expect(outcome).toBe('installed');
    // A marker-only skill has no supporting files, so there's no hybrid to guard
    // against — the reviewed body is written verbatim with no network request at all.
    expect(fetchBodySpy).not.toHaveBeenCalled();
    const [, files] = installSkillSpy.mock.calls[0];
    expect(files.get('SKILL.md')).toBe('SKILL BODY');
  });

  /** Holds the first install's write open and flags when a second write starts. */
  function heldFirstThenFlag(): { finishFirst: () => void; startedSecond: () => boolean } {
    let finish: (v: 'installed') => void = () => {};
    let started = false;
    installSkillSpy
      .mockImplementationOnce(
        () =>
          new Promise<'installed'>((resolve) => {
            finish = resolve;
          }),
      )
      .mockImplementationOnce(() => {
        started = true;
        return Promise.resolve('installed');
      });
    return { finishFirst: () => finish('installed'), startedSecond: () => started };
  }

  it('serializes concurrent installs to the same destination so writers never overlap', async () => {
    const store = useMarketplaceStore();
    store.init(fakePlugin(true));
    mockSkillSource('SKILL BODY');
    const { finishFirst, startedSecond } = heldFirstThenFlag();
    const target = { provider: 'claude', scope: 'project' } as const;
    const first = store.install(skillItem, 'SKILL BODY', target);
    const second = store.install(skillItem, 'SKILL BODY', target);
    await new Promise((resolve) => setTimeout(resolve)); // let the first reach its held write
    expect(startedSecond()).toBe(false); // queued behind the first, not racing it
    finishFirst();
    expect(await first).toBe('installed');
    expect(await second).toBe('installed');
    expect(startedSecond()).toBe(true); // it ran only after the first finished
  });

  it('serializes by destination folder, so a different id whose name maps to the same slug still queues', async () => {
    // A catalog refresh can bring a different id/name that normalizes to the SAME
    // destination folder. Keying by id would let them write concurrently (the item-9
    // rollback racing two writers on one folder); the destination key queues them.
    const store = useMarketplaceStore();
    store.init(fakePlugin(true));
    mockSkillSource('SKILL BODY');
    const { finishFirst, startedSecond } = heldFirstThenFlag();
    const target = { provider: 'claude', scope: 'project' } as const;
    const a: MarketplaceItem = { ...skillItem, id: 'skills/project-setup', name: 'project-setup' };
    const b: MarketplaceItem = { ...skillItem, id: 'skills/project-setup-v2', name: 'Project Setup' }; // → same slug
    const first = store.install(a, 'SKILL BODY', target);
    const second = store.install(b, 'SKILL BODY', target);
    await new Promise((resolve) => setTimeout(resolve));
    expect(startedSecond()).toBe(false); // b waits for a — same destination folder, not same id
    finishFirst();
    await first;
    await second;
    expect(startedSecond()).toBe(true);
    // b ran its OWN install (its item), never riding a's promise — no coalescing misreport.
    expect(installSkillSpy).toHaveBeenCalledTimes(2);
    expect(installSkillSpy.mock.calls[1][0]).toBe(b);
  });

  it('a queued install keeps the source it was enqueued under, even if the catalog switches during the wait', async () => {
    // Destination serialization introduces a WAIT before the queued run reads the
    // source. The source must be snapshotted at ENQUEUE — otherwise a leaf that reloads
    // to a new source during the wait would make the queued install fetch supporting
    // files from the new catalog while its reviewed marker came from the old one.
    const store = useMarketplaceStore();
    const p = fakePlugin(true);
    p.settings.marketplaceSourceUrl = 'https://a.example/';
    fetchIndexSpy.mockResolvedValue(manifest);
    store.init(p);
    await store.load(); // commit source A
    mockSkillSource('SKILL BODY');

    // Hold the first install (folder X) open so the second (same folder) queues under A.
    let finishFirst: (v: 'installed') => void = () => {};
    installSkillSpy.mockImplementationOnce(
      () =>
        new Promise<'installed'>((resolve) => {
          finishFirst = resolve;
        }),
    );
    const target = { provider: 'claude', scope: 'project' } as const;
    const first = store.install(skillItem, 'SKILL BODY', target);
    const second = store.install(skillItem, 'SKILL BODY', target); // enqueued under source A
    await new Promise((resolve) => setTimeout(resolve)); // first reaches its held write; second waits

    // A concurrent leaf reloads to source B while the queued second still waits.
    p.settings.marketplaceSourceUrl = 'https://b.example/';
    await store.load(); // commits source B (source.value → B)
    clientCtor.mockClear();

    finishFirst('installed');
    await first;
    await second; // runs now, AFTER the switch — its fetches must still target A
    expect(clientCtor).toHaveBeenCalledWith('https://a.example/');
    expect(clientCtor).not.toHaveBeenCalledWith('https://b.example/');
  });

  it('runs a later install of the same destination fresh once the first has settled', async () => {
    const store = useMarketplaceStore();
    store.init(fakePlugin(true));
    mockSkillSource('SKILL BODY');
    const target = { provider: 'claude', scope: 'project' } as const;
    await store.install(skillItem, 'SKILL BODY', target);
    await new Promise((resolve) => setTimeout(resolve)); // let the queued tail clear
    await store.install(skillItem, 'SKILL BODY', target);
    // The tail promise is freed on settlement, so a genuinely later install runs its
    // own install rather than chaining onto a settled one.
    expect(installSkillSpy).toHaveBeenCalledTimes(2);
  });

  it('does NOT invalidate caches when the skill was already installed (skipped)', async () => {
    installSkillSpy.mockResolvedValue('skipped');
    const store = useMarketplaceStore();
    const plugin = fakePlugin(true);
    store.init(plugin);
    mockSkillSource('SKILL BODY');
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

  it('aborts a user-scope install whose provider lost the capability before the write', async () => {
    // e.g. Codex switched native→WSL, or Claude's loadUserSettings was disabled, while the
    // install was queued/downloading. The captured target would otherwise write to host home
    // the runtime no longer scans — a silent "installed" the provider can't discover.
    installsUserScopeSpy.mockReturnValue(false);
    const store = useMarketplaceStore();
    store.init(fakePlugin(true));
    mockSkillSource('SKILL BODY');
    await expect(
      store.install(skillItem, 'SKILL BODY', { provider: 'codex', scope: 'user' }),
    ).rejects.toThrow(/no longer install user-scope|choose a target again/i);
    expect(installSkillSpy).not.toHaveBeenCalled(); // nothing written
  });

  it('does NOT gate a project-scope install on the user-scope capability', async () => {
    installsUserScopeSpy.mockReturnValue(false); // user-scope off — but this is a project install
    const store = useMarketplaceStore();
    store.init(fakePlugin(true));
    mockSkillSource('SKILL BODY');
    const outcome = await store.install(skillItem, 'SKILL BODY', { provider: 'claude', scope: 'project' });
    expect(outcome).toBe('installed'); // project scope is unaffected by the user-scope gate
    expect(installSkillSpy).toHaveBeenCalled();
  });

  it('rejects a skill declaring more files than the count cap, before any fetch', async () => {
    const store = useMarketplaceStore();
    store.init(fakePlugin(true));
    const tooMany: MarketplaceItem = {
      ...skillItem,
      files: [
        'skills/project-setup/SKILL.md',
        ...Array.from({ length: MAX_SKILL_FILES }, (_unused, i) => `skills/project-setup/f${i}.md`),
      ],
    };
    await expect(
      store.install(tooMany, 'SKILL BODY', { provider: 'claude', scope: 'project' }),
    ).rejects.toThrow(/files, over the .*limit/i);
    expect(fetchBodySpy).not.toHaveBeenCalled(); // rejected before downloading anything
    expect(installSkillSpy).not.toHaveBeenCalled();
  });

  it('rejects a skill whose supporting file exceeds the per-file size cap', async () => {
    fetchBodySpy.mockResolvedValue('x'.repeat(MAX_SKILL_FILE_CHARS + 1));
    const store = useMarketplaceStore();
    store.init(fakePlugin(true));
    await expect(
      store.install(skillItem, 'SKILL BODY', { provider: 'claude', scope: 'project' }),
    ).rejects.toThrow(/too large to install/i);
    expect(installSkillSpy).not.toHaveBeenCalled(); // nothing written on an over-cap file
  });

  it('applies the per-file size cap to the SKILL.md body too (even a marker-only skill)', async () => {
    const markerOnly: MarketplaceItem = { ...skillItem, files: ['skills/project-setup/SKILL.md'] };
    const store = useMarketplaceStore();
    store.init(fakePlugin(true));
    await expect(
      store.install(markerOnly, 'x'.repeat(MAX_SKILL_FILE_CHARS + 1), { provider: 'claude', scope: 'project' }),
    ).rejects.toThrow(/too large to install/i);
    expect(fetchBodySpy).not.toHaveBeenCalled(); // marker-only: no supporting fetch ran
    expect(installSkillSpy).not.toHaveBeenCalled();
  });

  it('rejects a skill whose supporting files exceed the aggregate size cap', async () => {
    // Each file is at (not over) the per-file cap; their running total crosses the aggregate.
    fetchBodySpy.mockResolvedValue('x'.repeat(MAX_SKILL_FILE_CHARS));
    const count = Math.floor(MAX_SKILL_TOTAL_CHARS / MAX_SKILL_FILE_CHARS) + 1;
    const many: MarketplaceItem = {
      ...skillItem,
      files: [
        'skills/project-setup/SKILL.md',
        ...Array.from({ length: count }, (_unused, i) => `skills/project-setup/big${i}.md`),
      ],
    };
    const store = useMarketplaceStore();
    store.init(fakePlugin(true));
    await expect(
      store.install(many, 'SKILL BODY', { provider: 'claude', scope: 'project' }),
    ).rejects.toThrow(/total limit/i);
    expect(installSkillSpy).not.toHaveBeenCalled();
  });

  it('stops pulling new fetch work after the first failure (no overlapping in-flight batch)', async () => {
    const many: MarketplaceItem = {
      ...skillItem,
      files: [
        'skills/project-setup/SKILL.md',
        ...Array.from({ length: 19 }, (_unused, i) => `skills/project-setup/f${i}.md`),
      ],
    };
    fetchBodySpy.mockRejectedValueOnce(new Error('boom')); // the first supporting fetch fails
    const store = useMarketplaceStore();
    store.init(fakePlugin(true));
    await expect(
      store.install(many, 'SKILL BODY', { provider: 'claude', scope: 'project' }),
    ).rejects.toThrow(/boom/);
    // Workers stop pulling after the first failure — far fewer than all 19 are fetched
    // (the old Promise.all left the other workers running the whole batch).
    expect(fetchBodySpy.mock.calls.length).toBeLessThan(19);
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

  it('refuses a fetched file that is not text (NUL byte), even with a text extension', async () => {
    const store = useMarketplaceStore();
    store.init(fakePlugin(true));
    // A supporting file with a text extension but binary bytes slips the extension
    // pre-check; the content check after fetch (NUL byte) catches it. The marker
    // re-fetch still matches the reviewed body, so the flow reaches the text check.
    mockSkillSource('SKILL BODY', `corrupt${String.fromCharCode(0)}bytes`);
    await expect(
      store.install(skillItem, 'SKILL BODY', { provider: 'claude', scope: 'project' }),
    ).rejects.toThrow(/not text|text-only/i);
    expect(installSkillSpy).not.toHaveBeenCalled();
  });

  it('skips WITHOUT fetching when the target already has the skill (preflight)', async () => {
    isSkillInstalledAtSpy.mockResolvedValue(true); // preflight: already installed here
    const store = useMarketplaceStore();
    store.init(fakePlugin(true));
    const outcome = await store.install(skillItem, 'SKILL BODY', { provider: 'claude', scope: 'project' });
    expect(outcome).toBe('skipped');
    expect(fetchBodySpy).not.toHaveBeenCalled(); // no needless folder download
    expect(installSkillSpy).not.toHaveBeenCalled(); // installer not reached
  });

  it('fetches supporting files from the source snapshotted at install start, not a concurrent switch', async () => {
    const store = useMarketplaceStore();
    const p = fakePlugin(true);
    p.settings.marketplaceSourceUrl = 'https://a.example/';
    store.init(p);
    await store.load(); // commits source A
    clientCtor.mockClear();
    // A source switch happens mid-install; the in-flight install must keep using
    // the source it snapshotted at start (A), never the newly-set B.
    p.settings.marketplaceSourceUrl = 'https://b.example/';
    mockSkillSource('SKILL BODY');
    await store.install(skillItem, 'SKILL BODY', { provider: 'claude', scope: 'project' });
    expect(clientCtor).toHaveBeenCalledWith('https://a.example/');
    expect(clientCtor).not.toHaveBeenCalledWith('https://b.example/');
  });

  it('stops starting new supporting-file fetches when networking is disabled mid-install', async () => {
    const store = useMarketplaceStore();
    const p = fakePlugin(true);
    store.init(p);
    // More files than the concurrency limit, so later fetches start after earlier
    // ones finish — the window where a mid-install opt-out must take effect.
    const manyFiles: MarketplaceItem = {
      ...skillItem,
      files: ['skills/project-setup/SKILL.md', ...Array.from({ length: 8 }, (_, i) => `skills/project-setup/f${i}.md`)],
    };
    let calls = 0;
    fetchBodySpy.mockImplementation(async () => {
      calls += 1;
      if (calls === 1) p.settings.marketplaceNetworkEnabled = false; // opt out mid-install
      return 'ok';
    });
    await expect(
      store.install(manyFiles, 'SKILL BODY', { provider: 'claude', scope: 'project' }),
    ).rejects.toThrow(/disabled/i);
    expect(calls).toBeLessThan(8); // not every file was fetched — later ones were blocked
    expect(installSkillSpy).not.toHaveBeenCalled();
  });
});
