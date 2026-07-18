import { fireEvent, render, screen, waitFor, within } from '@testing-library/vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, reactive } from 'vue';

import type { MarketplaceItem } from '@/features/marketplace/catalogTypes';
import { PLUGIN_KEY } from '@/features/marketplace/vue/marketplaceKeys';

interface StoreFake {
  items: MarketplaceItem[];
  installedIds: Set<string>;
  loading: boolean;
  error: string | null;
  offline: boolean;
  source: string;
  init: ReturnType<typeof vi.fn>;
  load: ReturnType<typeof vi.fn>;
  fetchBody: ReturnType<typeof vi.fn>;
  install: ReturnType<typeof vi.fn>;
  refreshInstalled: ReturnType<typeof vi.fn>;
}

// The real store constructs a MarketplaceCatalogClient that hits the network on
// load()/fetchBody(); swap the whole store for a capture-and-stub fake so the
// view is tested against a pinned reactive contract, not GitHub.
const hoisted = vi.hoisted(() => ({ store: null as unknown }));
vi.mock('@/features/marketplace/vue/stores/marketplaceStore', () => ({
  useMarketplaceStore: () => hoisted.store,
}));

import MarketplaceRoot from '@/features/marketplace/vue/MarketplaceRoot.vue';

const alpha: MarketplaceItem = {
  id: 'a',
  type: 'loop',
  name: 'Alpha Loop',
  description: 'Alpha description',
  path: 'loops/alpha.md',
  tags: ['tag1'],
  author: 'Ann Author',
  license: 'MIT',
  source: 'https://example.test/alpha',
};

const beta: MarketplaceItem = {
  id: 'b',
  type: 'agent',
  name: 'Beta Agent',
  description: 'Beta description',
  path: 'agents/beta.md',
  tags: ['tag2'],
};

function makeStore(overrides: Partial<StoreFake> = {}): StoreFake {
  return {
    items: [],
    installedIds: new Set<string>(),
    loading: false,
    error: null,
    offline: false,
    source: 'https://example.test/catalog',
    init: vi.fn(),
    load: vi.fn().mockResolvedValue(undefined),
    fetchBody: vi.fn().mockResolvedValue('BODY TEXT'),
    install: vi.fn().mockResolvedValue('installed'),
    refreshInstalled: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function setup(
  store: StoreFake,
  settings: Record<string, unknown>,
  saveSettings: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined),
) {
  hoisted.store = store;
  // One plugin whose settings object is mutated in place by enable() — assert
  // on the same reference the view flipped.
  const plugin = {
    settings,
    saveSettings,
    // Stubs the live-sync composable subscribes to on mount (returns an
    // unsubscribe disposer / EventRef, the real bus + vault contract).
    app: { vault: { on: vi.fn(() => ({})), offref: vi.fn() } },
    vaultFileAdapter: {},
    agentRosterStore: {},
    events: { on: vi.fn(() => vi.fn()) },
  };
  const utils = render(MarketplaceRoot, {
    global: { provide: { [PLUGIN_KEY as symbol]: plugin } },
  });
  return { store, plugin, ...utils };
}

describe('MarketplaceRoot opt-in gate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the enable prompt (not the list) when the network is disabled', () => {
    const { store } = setup(makeStore({ items: [alpha, beta] }), {
      marketplaceNetworkEnabled: false,
    });
    expect(screen.getByText(/Marketplace is off/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enable the Marketplace' })).toBeTruthy();
    // The gate is dark: no cards, and merely opening the view never fetches.
    expect(screen.queryByText('Alpha Loop')).toBeNull();
    expect(store.load).not.toHaveBeenCalled();
  });

  it('Enable flips the setting, persists it, and kicks off the first load', async () => {
    const { store, plugin } = setup(makeStore(), {
      marketplaceNetworkEnabled: false,
      // Warning already shown so the one-time gate returns early (no extra
      // Notice) and the flow stays deterministic.
      marketplaceNetworkWarningShown: true,
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Enable the Marketplace' }));
    await waitFor(() => expect(store.load).toHaveBeenCalled());
    expect(plugin.settings.marketplaceNetworkEnabled).toBe(true);
    expect(plugin.saveSettings).toHaveBeenCalled();
    // Gate cleared: the enabled chrome (Refresh) is now mounted.
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeTruthy();
  });
});

describe('MarketplaceRoot list', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders a card per item and marks the installed one', async () => {
    setup(makeStore({ items: [alpha, beta], installedIds: new Set(['b']) }), {
      marketplaceNetworkEnabled: true,
    });
    await screen.findByText('Alpha Loop');
    expect(document.querySelectorAll('.marketplace-entry')).toHaveLength(2);

    // Beta is installed → the installed indicator, no Preview button.
    const betaCard = screen.getByRole('button', { name: 'Beta Agent' });
    expect(within(betaCard).getByText('Installed')).toBeTruthy();
    expect(within(betaCard).queryByRole('button', { name: 'Preview' })).toBeNull();

    // Alpha is not installed → a Preview button (install is gated behind it).
    const alphaCard = screen.getByRole('button', { name: 'Alpha Loop' });
    expect(within(alphaCard).getByRole('button', { name: 'Preview' })).toBeTruthy();
  });
});

describe('MarketplaceRoot type filter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('filters the list to the chosen catalog type and restores on toggle-off', async () => {
    setup(makeStore({ items: [alpha, beta] }), { marketplaceNetworkEnabled: true });
    await screen.findByText('Alpha Loop');
    expect(document.querySelectorAll('.marketplace-entry')).toHaveLength(2);

    // Scope to the type group so the chip isn't confused with the same-named
    // type badge each card renders.
    const typeGroup = screen.getByRole('group', { name: 'Filter by type' });
    const agentChip = within(typeGroup).getByRole('button', { name: 'Agent' });

    // Filtering to Agent hides the loop card.
    await fireEvent.click(agentChip);
    await waitFor(() => expect(document.querySelectorAll('.marketplace-entry')).toHaveLength(1));
    expect(screen.queryByText('Alpha Loop')).toBeNull();
    expect(screen.getByText('Beta Agent')).toBeTruthy();

    // Toggling the same chip off restores both.
    await fireEvent.click(agentChip);
    await waitFor(() => expect(document.querySelectorAll('.marketplace-entry')).toHaveLength(2));
  });

  it('hides the type facet when the catalog has only one type', async () => {
    setup(makeStore({ items: [alpha] }), { marketplaceNetworkEnabled: true });
    await screen.findByText('Alpha Loop');
    expect(screen.queryByRole('group', { name: 'Filter by type' })).toBeNull();
  });

  it('clears an active type filter via the All types chip', async () => {
    setup(makeStore({ items: [alpha, beta] }), { marketplaceNetworkEnabled: true });
    await screen.findByText('Alpha Loop');
    const typeGroup = screen.getByRole('group', { name: 'Filter by type' });
    await fireEvent.click(within(typeGroup).getByRole('button', { name: 'Agent' }));
    await waitFor(() => expect(document.querySelectorAll('.marketplace-entry')).toHaveLength(1));

    await fireEvent.click(within(typeGroup).getByRole('button', { name: 'All types' }));
    await waitFor(() => expect(document.querySelectorAll('.marketplace-entry')).toHaveLength(2));
  });

  it('prunes a stranded type filter when its type leaves the reloaded catalog', async () => {
    const store = reactive(makeStore({ items: [alpha, beta] }));
    setup(store as StoreFake, {
      marketplaceNetworkEnabled: true,
      marketplaceNetworkWarningShown: true,
    });
    await screen.findByText('Alpha Loop');
    const typeGroup = screen.getByRole('group', { name: 'Filter by type' });
    await fireEvent.click(within(typeGroup).getByRole('button', { name: 'Loop' }));
    await waitFor(() => expect(screen.queryByText('Beta Agent')).toBeNull());

    // A reload drops every loop; the stranded Loop filter must be pruned so the
    // list falls back to "all" instead of rendering empty with no visible cause.
    store.items = [beta];
    await nextTick();
    await waitFor(() => {
      expect(document.querySelectorAll('.marketplace-entry')).toHaveLength(1);
      expect(screen.getByText('Beta Agent')).toBeTruthy();
    });
  });
});

describe('MarketplaceRoot preview + install', () => {
  beforeEach(() => vi.clearAllMocks());

  it('installs the exact body shown in the preview (no re-fetch)', async () => {
    const { store } = setup(makeStore({ items: [alpha] }), {
      marketplaceNetworkEnabled: true,
    });
    await screen.findByText('Alpha Loop');
    // Security contract: no Install button until the preview is opened.
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull();

    await fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    // The reviewed body renders in the preview...
    await screen.findByText('BODY TEXT');
    expect(store.fetchBody).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));

    // ...and Install hands that same body straight to the store — the store no
    // longer re-fetches, so what installs is exactly what was reviewed.
    await fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    await waitFor(() =>
      expect(store.install).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'a' }),
        'BODY TEXT',
      ),
    );
  });

  it('keeps Install disabled until the previewed body has loaded', async () => {
    // A body fetch left pending: the preview is open but nothing is shown yet,
    // so a fast click must not install content the user never saw.
    let resolveBody: (v: string) => void = () => {};
    const pending = new Promise<string>((res) => {
      resolveBody = res;
    });
    const { store } = setup(
      makeStore({ items: [alpha], fetchBody: vi.fn().mockReturnValue(pending) }),
      { marketplaceNetworkEnabled: true },
    );
    await screen.findByText('Alpha Loop');
    await fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

    const installBtn = (await screen.findByRole('button', { name: 'Install' })) as HTMLButtonElement;
    expect(installBtn.disabled).toBe(true);
    // Even if the click lands, the view's guard blocks an install with no body.
    await fireEvent.click(installBtn);
    expect(store.install).not.toHaveBeenCalled();

    resolveBody('LATE BODY');
    await screen.findByText('LATE BODY');
    await waitFor(() => expect(installBtn.disabled).toBe(false));
    await fireEvent.click(installBtn);
    await waitFor(() =>
      expect(store.install).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'a' }),
        'LATE BODY',
      ),
    );
  });
});

describe('MarketplaceRoot network warning + preview invalidation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('awaits the one-time network warning BEFORE loading on an already-enabled mount', async () => {
    // The settings-tab toggle can enable networking without going through the
    // view's Enable button, so an already-enabled mount must still warn — and
    // the warning must complete before the first catalog fetch. A deferred
    // saveSettings pins the warning open so we can prove load() waits for it.
    let resolveSave: () => void = () => {};
    const savePromise = new Promise<void>((r) => {
      resolveSave = r;
    });
    const store = makeStore({ items: [alpha] });
    const { plugin } = setup(
      store,
      { marketplaceNetworkEnabled: true },
      vi.fn().mockReturnValue(savePromise),
    );

    // Warning in flight (save pending) → the fetch must not have started yet.
    await Promise.resolve();
    expect(store.load).not.toHaveBeenCalled();

    resolveSave();
    await waitFor(() => expect(store.load).toHaveBeenCalled());
    expect(plugin.settings.marketplaceNetworkWarningShown).toBe(true);
  });

  it('drops cached previews when the catalog reloads (source switch / refresh)', async () => {
    // A reactive store so reassigning items triggers the component's watch.
    const store = reactive(
      makeStore({ items: [alpha], fetchBody: vi.fn().mockResolvedValue('OLD BODY') }),
    );
    setup(store as StoreFake, {
      marketplaceNetworkEnabled: true,
      marketplaceNetworkWarningShown: true,
    });
    await screen.findByText('Alpha Loop');
    await fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    await screen.findByText('OLD BODY');

    // A reload (e.g. after changing marketplaceSourceUrl) replaces the catalog;
    // a fork could reuse id 'a' for different content, so the stale preview must
    // not survive — the expanded body collapses and Preview must re-fetch.
    store.items = [{ ...alpha }];
    await nextTick();
    await waitFor(() => expect(screen.queryByText('OLD BODY')).toBeNull());
  });

  it('discards a preview body that resolves AFTER a catalog reload (no stale write)', async () => {
    // The first fetch stays pending across the reload, then resolves late.
    let resolveStale: (v: string) => void = () => {};
    const stalePending = new Promise<string>((r) => {
      resolveStale = r;
    });
    const fetchBody = vi
      .fn()
      .mockReturnValueOnce(stalePending)
      .mockResolvedValue('FRESH BODY');
    const store = reactive(makeStore({ items: [alpha], fetchBody }));
    setup(store as StoreFake, {
      marketplaceNetworkEnabled: true,
      marketplaceNetworkWarningShown: true,
    });
    await screen.findByText('Alpha Loop');

    await fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    // Catalog reloads while the first fetch is still in flight (generation bumps).
    store.items = [{ ...alpha }];
    await nextTick();
    // The stale fetch resolves only now — its body must be discarded, not cached.
    resolveStale('STALE BODY');
    await nextTick();
    await Promise.resolve();

    // Re-open the preview: because nothing stale was cached, it re-fetches.
    await fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    await screen.findByText('FRESH BODY');
    expect(screen.queryByText('STALE BODY')).toBeNull();
    expect(fetchBody).toHaveBeenCalledTimes(2);
  });
});

describe('MarketplaceRoot installed-badge live-sync', () => {
  beforeEach(() => vi.clearAllMocks());

  it('subscribes to roster + vault mutations to keep Installed badges fresh', async () => {
    const { plugin } = setup(makeStore({ items: [alpha] }), { marketplaceNetworkEnabled: true });
    await screen.findByText('Alpha Loop');
    // Agents reach the store via the event bus; loop/template/quick-action notes
    // surface only as folder-scoped vault events — the composable wires both.
    expect(plugin.events.on).toHaveBeenCalledWith('roster:changed', expect.any(Function));
    expect(plugin.app.vault.on).toHaveBeenCalledWith('delete', expect.any(Function));
    expect(plugin.app.vault.on).toHaveBeenCalledWith('rename', expect.any(Function));
  });
});
