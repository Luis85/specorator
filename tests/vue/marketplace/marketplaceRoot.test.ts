import { fireEvent, render, screen, waitFor, within } from '@testing-library/vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    ...overrides,
  };
}

function setup(store: StoreFake, settings: Record<string, unknown>) {
  hoisted.store = store;
  // One plugin whose settings object is mutated in place by enable() — assert
  // on the same reference the view flipped.
  const plugin = {
    settings,
    saveSettings: vi.fn().mockResolvedValue(undefined),
    app: { vault: {} },
    vaultFileAdapter: {},
    agentRosterStore: {},
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
