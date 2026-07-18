import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';

import type SpecoratorPlugin from '../../../../main';
import type { MarketplaceItem } from '../../catalogTypes';
import { MarketplaceCache } from '../../MarketplaceCache';
import {
  DEFAULT_MARKETPLACE_BASE_URL,
  MarketplaceCatalogClient,
  MarketplaceError,
} from '../../MarketplaceCatalogClient';
import {
  installMarketplaceItem,
  type InstallOutcome,
  isItemInstalled,
  type MarketplaceInstallDeps,
} from '../../MarketplaceInstaller';

/**
 * Marketplace store: fetches the catalog manifest via the client (falling back
 * to the on-disk cache when offline), tracks which items are already installed,
 * and routes installs through the shared installer. I/O lives in the client /
 * cache / installer; the store is the reactive projection the view renders.
 */
export const useMarketplaceStore = defineStore('marketplace', () => {
  let plugin: SpecoratorPlugin | null = null;

  const items = shallowRef<MarketplaceItem[]>([]);
  const installedIds = shallowRef<ReadonlySet<string>>(new Set());
  const loading = ref(false);
  const error = ref<string | null>(null);
  /** True when the list is served from the on-disk cache (a fetch failed). */
  const offline = ref(false);
  const source = ref(DEFAULT_MARKETPLACE_BASE_URL);
  const loaded = ref(false);

  function init(p: SpecoratorPlugin): void {
    plugin ??= p;
  }

  function requirePlugin(): SpecoratorPlugin {
    if (!plugin) throw new Error('Marketplace store used before init(plugin).');
    return plugin;
  }

  function resolveSource(): string {
    const override = requirePlugin().settings.marketplaceSourceUrl?.trim();
    return override || DEFAULT_MARKETPLACE_BASE_URL;
  }

  function client(): MarketplaceCatalogClient {
    return new MarketplaceCatalogClient(resolveSource());
  }

  function cache(): MarketplaceCache {
    return new MarketplaceCache(requirePlugin().vaultFileAdapter);
  }

  function installDeps(): MarketplaceInstallDeps {
    const p = requirePlugin();
    return {
      vault: p.app.vault,
      adapter: p.vaultFileAdapter,
      rosterStore: p.agentRosterStore,
      loopFolder: p.settings.agentBoardLoopFolder || 'Agent Board/loops',
      templateFolder: p.settings.agentBoardTemplateFolder || 'Agent Board/templates',
      quickActionsFolder: p.settings.quickActionsFolder || 'Quick Actions',
    };
  }

  async function refreshInstalled(): Promise<void> {
    const deps = installDeps();
    const ids = new Set<string>();
    for (const item of items.value) {
      try {
        if (await isItemInstalled(item, deps)) ids.add(item.id);
      } catch {
        // a folder-resolution hiccup shouldn't blank the whole list
      }
    }
    installedIds.value = ids;
  }

  /** Fetches the catalog; on failure falls back to the cached copy for the same source. */
  async function load(): Promise<void> {
    if (loading.value) return;
    loading.value = true;
    error.value = null;
    const src = resolveSource();
    source.value = src;
    try {
      const manifest = await client().fetchIndex();
      items.value = manifest.items;
      offline.value = false;
      await cache().write(manifest, src, Date.now());
    } catch (fetchError) {
      const cached = await cache().read();
      if (cached && cached.source === src) {
        items.value = cached.manifest.items;
        offline.value = true;
      } else {
        items.value = [];
        error.value =
          fetchError instanceof MarketplaceError || fetchError instanceof Error
            ? fetchError.message
            : String(fetchError);
      }
    } finally {
      loading.value = false;
      loaded.value = true;
      await refreshInstalled();
    }
  }

  /** Fetches one item's raw body (for the preview pane). */
  async function fetchBody(item: MarketplaceItem): Promise<string> {
    return client().fetchItemBody(item.path);
  }

  /** Installs an item, marking it installed on success (or if already present). */
  async function install(item: MarketplaceItem): Promise<InstallOutcome> {
    const body = await client().fetchItemBody(item.path);
    const outcome = await installMarketplaceItem(item, body, installDeps(), Date.now());
    const next = new Set(installedIds.value);
    next.add(item.id);
    installedIds.value = next;
    return outcome;
  }

  return {
    items,
    installedIds,
    loading,
    error,
    offline,
    source,
    loaded,
    init,
    load,
    fetchBody,
    install,
  };
});
