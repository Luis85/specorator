import { fireEvent, render, screen, waitFor, within } from '@testing-library/vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, reactive, type Ref,ref } from 'vue';

import type { MarketplaceItem } from '@/features/marketplace/catalogTypes';
import { PLUGIN_KEY, REQUESTED_VIEW_KEY } from '@/features/marketplace/vue/marketplaceKeys';
import type { MarketplaceView } from '@/features/marketplace/vue/marketplaceView';

interface StoreFake {
  items: MarketplaceItem[];
  installedIds: Set<string>;
  loading: boolean;
  error: string | null;
  offline: boolean;
  loaded: boolean;
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
    loaded: false,
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
  requestedViewRef: Ref<MarketplaceView | null> = ref<MarketplaceView | null>(null),
) {
  hoisted.store = store;
  // Capture the settings-changed subscribers (the opt-in gate + the install-
  // refresh composable) so a test can fire the event the Settings tab emits.
  const settingsChangedHandlers: Array<() => void> = [];
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
    events: {
      on: vi.fn((name: string, handler: () => void) => {
        if (name === 'settings-changed') settingsChangedHandlers.push(handler);
        return vi.fn();
      }),
    },
  };
  const utils = render(MarketplaceRoot, {
    global: {
      provide: {
        [PLUGIN_KEY as symbol]: plugin,
        [REQUESTED_VIEW_KEY as symbol]: requestedViewRef,
      },
    },
  });
  const fireSettingsChanged = (): void => settingsChangedHandlers.forEach((handler) => handler());
  return { store, plugin, requestedViewRef, fireSettingsChanged, ...utils };
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

  it('reacts to enabling networking from the Settings tab (settings-changed), no remount', async () => {
    const settings: Record<string, unknown> = {
      marketplaceNetworkEnabled: false,
      // Warning already shown so the one-time gate no-ops (deterministic flow).
      marketplaceNetworkWarningShown: true,
    };
    const { store, fireSettingsChanged } = setup(makeStore(), settings);
    // The leaf shows the gate and hasn't loaded.
    expect(screen.getByText(/Marketplace is off/)).toBeTruthy();
    expect(store.load).not.toHaveBeenCalled();

    // The user flips the toggle on the Settings tab (a modal over this leaf):
    // settings mutate and saveSettings fires settings-changed. The open leaf must
    // re-read the gate and load — no Enable click, no remount.
    settings.marketplaceNetworkEnabled = true;
    fireSettingsChanged();
    await waitFor(() => expect(store.load).toHaveBeenCalled());
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
    expect(document.querySelectorAll('.specorator-vue-marketplace-card')).toHaveLength(2);

    // Beta is installed → the installed indicator inside its card.
    const betaCard = screen.getByRole('button', { name: 'Beta Agent' });
    expect(within(betaCard).getByText('Installed')).toBeTruthy();

    // Alpha is not installed → a clickable card with no Installed indicator
    // (Install is gated behind opening the detail).
    const alphaCard = screen.getByRole('button', { name: 'Alpha Loop' });
    expect(within(alphaCard).queryByText('Installed')).toBeNull();
  });

  it('reuses the already-loaded catalog on mount instead of re-fetching', async () => {
    // The shared store retains a catalog from a prior leaf/open; mounting must
    // NOT auto-fetch again (reopening reuses it, Refresh is the on-demand path).
    const { store } = setup(makeStore({ items: [alpha], loaded: true }), {
      marketplaceNetworkEnabled: true,
      marketplaceNetworkWarningShown: true,
    });
    await screen.findByText('Alpha Loop');
    await Promise.resolve();
    expect(store.load).not.toHaveBeenCalled();
    // ...but installed state IS re-scanned on the reuse-mount: mutations made while
    // every leaf was closed weren't observed by any subscription, so skipping the
    // scan too would leave stale Installed badges until a later event / Refresh.
    await waitFor(() => expect(store.refreshInstalled).toHaveBeenCalled());
  });
});

describe('MarketplaceRoot chrome-first + Home sort', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps the nav + search/sort toolbar mounted during the initial skeleton load', async () => {
    setup(makeStore({ loading: true, items: [] }), {
      marketplaceNetworkEnabled: true,
      marketplaceNetworkWarningShown: true,
    });
    // Chrome-first: the category nav and the toolbar render immediately, before
    // the catalog lands — not only once store.items is populated.
    expect(screen.getByRole('navigation', { name: 'Marketplace categories' })).toBeTruthy();
    expect(await screen.findByRole('searchbox')).toBeTruthy();
    // The skeleton grid stands in for the not-yet-loaded catalog.
    expect(document.querySelectorAll('.specorator-vue-marketplace-skeleton').length).toBeGreaterThan(0);
  });

  it('applies the toolbar sort to the Home sections (sorted rows, not catalog order)', async () => {
    const zeta: MarketplaceItem = {
      id: 'z', type: 'loop', name: 'Zeta Loop', description: 'd', path: 'loops/z.md', tags: [],
    };
    const aardvark: MarketplaceItem = {
      id: 'al', type: 'loop', name: 'Aardvark Loop', description: 'd', path: 'loops/al.md', tags: [],
    };
    // Catalog order is [Zeta, Aardvark]; the default 'name' sort must reorder the
    // Home section to [Aardvark, Zeta] — proving sections derive from sorted rows.
    setup(makeStore({ items: [zeta, aardvark] }), { marketplaceNetworkEnabled: true });
    await screen.findByText('Zeta Loop');
    const order = [...document.querySelectorAll('.specorator-vue-marketplace-card')].map((card) =>
      card.getAttribute('aria-label'),
    );
    expect(order).toEqual(['Aardvark Loop', 'Zeta Loop']);
  });
});

describe('MarketplaceRoot category nav', () => {
  beforeEach(() => vi.clearAllMocks());

  it('scopes the grid to the selected category tab and returns to Home', async () => {
    setup(makeStore({ items: [alpha, beta] }), { marketplaceNetworkEnabled: true });
    await screen.findByText('Alpha Loop');
    const nav = screen.getByRole('navigation', { name: 'Marketplace categories' });

    // Selecting the Agent category hides the loop card.
    await fireEvent.click(within(nav).getByRole('button', { name: /Agent/ }));
    await waitFor(() =>
      expect(document.querySelectorAll('.specorator-vue-marketplace-card')).toHaveLength(1),
    );
    expect(screen.queryByText('Alpha Loop')).toBeNull();
    expect(screen.getByText('Beta Agent')).toBeTruthy();

    // Home restores both (rendered in per-type sections).
    await fireEvent.click(within(nav).getByRole('button', { name: 'Home' }));
    await waitFor(() =>
      expect(document.querySelectorAll('.specorator-vue-marketplace-card')).toHaveLength(2),
    );
  });

  it('hands focus to the active nav button after a "See all" jump', async () => {
    // "See all" unmounts MarketplaceHome (and the button the user activated), so
    // without a handoff keyboard focus falls to <body>. The Root moves it to the
    // now-active category nav button (jsdom doesn't reflect focus in
    // document.activeElement, so assert the focus() call landed on that button).
    setup(makeStore({ items: [alpha, beta] }), { marketplaceNetworkEnabled: true });
    await screen.findByText('Alpha Loop');

    // Home renders one "See all" per present type; pick the Loop section's.
    const loopSection = [...document.querySelectorAll('.specorator-vue-marketplace-section')].find(
      (section) => section.textContent?.includes('Alpha Loop'),
    );
    expect(loopSection).toBeTruthy();
    const seeAll = within(loopSection as HTMLElement).getByRole('button', { name: 'See all' });

    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus');
    try {
      await fireEvent.click(seeAll);
      const nav = screen.getByRole('navigation', { name: 'Marketplace categories' });
      const loopNav = within(nav).getByRole('button', { name: /Loop/ });
      await waitFor(() => {
        expect(loopNav.getAttribute('aria-current')).toBe('page');
        expect(focusSpy.mock.instances.at(-1)).toBe(loopNav);
      });
    } finally {
      focusSpy.mockRestore();
    }
  });

  it('applies a per-leaf deep-link request and consumes it', async () => {
    // activateMarketplace sets the requested category on THIS leaf's view ref AFTER
    // it mounts (post loadIfDeferred); the Root applies it and clears the ref.
    const requestedViewRef = ref<MarketplaceView | null>(null);
    setup(makeStore({ items: [alpha, beta] }), { marketplaceNetworkEnabled: true }, undefined, requestedViewRef);
    await screen.findByText('Alpha Loop');
    requestedViewRef.value = 'agent';
    await nextTick();
    // Deep-linked to Agents: only the agent card renders (the loop is scoped out).
    await waitFor(() =>
      expect(document.querySelectorAll('.specorator-vue-marketplace-card')).toHaveLength(1),
    );
    expect(screen.queryByText('Alpha Loop')).toBeNull();
    // The request is consumed so a later change can't re-navigate.
    expect(requestedViewRef.value).toBeNull();
  });

  it('falls a deep-link to an already-empty category back to Home', async () => {
    // The retained catalog has no skills; a Skills deep-link must not strand on an
    // empty skill grid (there is no skill tab either) — the counts guard, now
    // watching activeView too, bounces it to Home even though counts don't change.
    const requestedViewRef = ref<MarketplaceView | null>(null);
    setup(
      makeStore({ items: [alpha, beta], loaded: true }),
      { marketplaceNetworkEnabled: true },
      undefined,
      requestedViewRef,
    );
    await screen.findByText('Alpha Loop');
    requestedViewRef.value = 'skill';
    await nextTick();
    await waitFor(() =>
      expect(document.querySelectorAll('.specorator-vue-marketplace-card')).toHaveLength(2),
    );
    expect(screen.queryByText('No items match your filters.')).toBeNull();
  });

  it('falls a deep-link back to Home when the loaded catalog is empty', async () => {
    // A valid but EMPTY catalog (loaded, zero items): a deep-link must land on Home,
    // not strand on an empty category grid with no tab. Gating the guard on
    // `store.loaded` (not item count) is what makes this case fall back.
    const requestedViewRef = ref<MarketplaceView | null>(null);
    setup(
      makeStore({ items: [], loaded: true }),
      { marketplaceNetworkEnabled: true },
      undefined,
      requestedViewRef,
    );
    requestedViewRef.value = 'agent';
    await nextTick();
    // Home landing (the hero) — not the category grid's "No items match".
    await waitFor(() => expect(screen.getByText(/Discover ready-made assets/)).toBeTruthy());
    expect(screen.queryByText('No items match your filters.')).toBeNull();
  });

  it('falls back to Home once an empty catalog finishes loading under a deep-link', async () => {
    // Deep-link applied BEFORE the (empty) catalog loads: it must stand pre-load,
    // then fall back to Home when `loaded` flips — the watcher observes `loaded`,
    // so an empty landing (no counts/activeView change) still corrects itself.
    const store = reactive(makeStore({ items: [], loaded: false }));
    const requestedViewRef = ref<MarketplaceView | null>(null);
    setup(
      store as StoreFake,
      { marketplaceNetworkEnabled: true, marketplaceNetworkWarningShown: true },
      undefined,
      requestedViewRef,
    );
    requestedViewRef.value = 'agent';
    await nextTick();
    store.loaded = true; // the empty catalog lands
    await nextTick();
    await waitFor(() => expect(screen.getByText(/Discover ready-made assets/)).toBeTruthy());
    expect(screen.queryByText('No items match your filters.')).toBeNull();
  });

  it('falls a deep-linked category back to Home after a hard catalog failure', async () => {
    // A hard failure (fetch throws, no matching cache) leaves `loaded` false by
    // design so the case retries on reopen. A category deep-link must still fall
    // back to Home (error banner + landing) instead of stranding on an empty
    // category grid whose nav button is absent — so the fallback keys on the load
    // being SETTLED (loaded OR a completed error), not on `loaded` alone.
    const store = reactive(makeStore({ items: [], loaded: false, loading: true }));
    const requestedViewRef = ref<MarketplaceView | null>(null);
    setup(
      store as StoreFake,
      { marketplaceNetworkEnabled: true, marketplaceNetworkWarningShown: true },
      undefined,
      requestedViewRef,
    );
    requestedViewRef.value = 'agent';
    await nextTick();
    // The load hard-fails: loading settles, no catalog landed, an error is set.
    store.loading = false;
    store.error = 'Network unreachable';
    await nextTick();
    // Home landing (the hero) + the error banner — not the empty category grid.
    await waitFor(() => expect(screen.getByText(/Discover ready-made assets/)).toBeTruthy());
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.queryByText('No items match your filters.')).toBeNull();
  });

  it('falls back to Home when the active category leaves the reloaded catalog', async () => {
    const store = reactive(makeStore({ items: [alpha, beta], loaded: true }));
    setup(store as StoreFake, {
      marketplaceNetworkEnabled: true,
      marketplaceNetworkWarningShown: true,
    });
    await screen.findByText('Alpha Loop');
    const nav = screen.getByRole('navigation', { name: 'Marketplace categories' });
    await fireEvent.click(within(nav).getByRole('button', { name: /Loop/ }));
    await waitFor(() => expect(screen.queryByText('Beta Agent')).toBeNull());

    // A reload drops every loop; the stranded Loop view must fall back to Home so
    // the grid doesn't render empty with no visible cause.
    store.items = [beta];
    await nextTick();
    await waitFor(() => {
      expect(document.querySelectorAll('.specorator-vue-marketplace-card')).toHaveLength(1);
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
    // Security contract: no Install button until the detail (preview) is opened.
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull();

    // Opening the card routes to the detail and fetches the body.
    await fireEvent.click(screen.getByRole('button', { name: 'Alpha Loop' }));
    await screen.findByText('BODY TEXT');
    expect(store.fetchBody).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));

    // Install hands that same body straight to the store — no re-fetch.
    await fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    await waitFor(() =>
      expect(store.install).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), 'BODY TEXT'),
    );
  });

  it('keeps Install disabled until the previewed body has loaded', async () => {
    // A body fetch left pending: the detail is open but nothing is shown yet, so
    // a fast click must not install content the user never saw.
    let resolveBody: (v: string) => void = () => {};
    const pending = new Promise<string>((res) => {
      resolveBody = res;
    });
    const { store } = setup(
      makeStore({ items: [alpha], fetchBody: vi.fn().mockReturnValue(pending) }),
      { marketplaceNetworkEnabled: true },
    );
    await screen.findByText('Alpha Loop');
    await fireEvent.click(screen.getByRole('button', { name: 'Alpha Loop' }));

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
      expect(store.install).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), 'LATE BODY'),
    );
  });
});

describe('MarketplaceRoot network warning + preview invalidation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('awaits the one-time network warning BEFORE loading on an already-enabled mount', async () => {
    // The settings-tab toggle can enable networking without going through the
    // view's Enable button, so an already-enabled mount must still warn — and the
    // warning must complete before the first catalog fetch. A deferred
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

  it('drops the open detail when the catalog reloads (source switch / refresh)', async () => {
    // A reactive store so reassigning items triggers the component's watch.
    const store = reactive(
      makeStore({ items: [alpha], fetchBody: vi.fn().mockResolvedValue('OLD BODY') }),
    );
    setup(store as StoreFake, {
      marketplaceNetworkEnabled: true,
      marketplaceNetworkWarningShown: true,
    });
    await screen.findByText('Alpha Loop');
    await fireEvent.click(screen.getByRole('button', { name: 'Alpha Loop' }));
    await screen.findByText('OLD BODY');

    // A reload (e.g. after changing marketplaceSourceUrl) replaces the catalog; a
    // fork could reuse id 'a' for different content, so the stale preview must not
    // survive — the detail closes and its body cache is dropped.
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
    const fetchBody = vi.fn().mockReturnValueOnce(stalePending).mockResolvedValue('FRESH BODY');
    const store = reactive(makeStore({ items: [alpha], fetchBody }));
    setup(store as StoreFake, {
      marketplaceNetworkEnabled: true,
      marketplaceNetworkWarningShown: true,
    });
    await screen.findByText('Alpha Loop');

    await fireEvent.click(screen.getByRole('button', { name: 'Alpha Loop' }));
    // Catalog reloads while the first fetch is still in flight (generation bumps).
    store.items = [{ ...alpha }];
    await nextTick();
    // The stale fetch resolves only now — its body must be discarded, not cached.
    resolveStale('STALE BODY');
    await nextTick();
    await Promise.resolve();

    // Re-open the detail: because nothing stale was cached, it re-fetches.
    await fireEvent.click(screen.getByRole('button', { name: 'Alpha Loop' }));
    await screen.findByText('FRESH BODY');
    expect(screen.queryByText('STALE BODY')).toBeNull();
    expect(fetchBody).toHaveBeenCalledTimes(2);
  });

  it('never enables Install on an unseen body when overlapping preview fetches disagree', async () => {
    // Open (fetch #1 pending) → Back → reopen (fetch #2). Only the LATEST attempt
    // may write, so a late FAILURE of #1 can't set previewErrors while #2's body
    // is shown — otherwise the detail would render the error yet keep Install
    // enabled on a body the user never saw.
    let rejectFirst: (reason?: unknown) => void = () => {};
    const first = new Promise<string>((_res, rej) => {
      rejectFirst = rej;
    });
    const fetchBody = vi.fn().mockReturnValueOnce(first).mockResolvedValueOnce('BODY2');
    setup(makeStore({ items: [alpha], fetchBody }), {
      marketplaceNetworkEnabled: true,
      marketplaceNetworkWarningShown: true,
    });
    await screen.findByText('Alpha Loop');

    await fireEvent.click(screen.getByRole('button', { name: 'Alpha Loop' })); // open (fetch #1)
    await fireEvent.click(screen.getByRole('button', { name: 'Back' })); // back
    await fireEvent.click(screen.getByRole('button', { name: 'Alpha Loop' })); // reopen (fetch #2)
    await screen.findByText('BODY2'); // fetch #2 (latest) populated the body
    rejectFirst(new Error('stale failure')); // fetch #1 fails late — must be discarded
    await nextTick();
    await Promise.resolve();

    expect(screen.getByText('BODY2')).toBeTruthy();
    expect(screen.queryByText("Couldn't load the marketplace catalog.")).toBeNull();
    const install = (await screen.findByRole('button', { name: 'Install' })) as HTMLButtonElement;
    expect(install.disabled).toBe(false);
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
