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
  // Bumped whenever a new catalog load begins, so async work (an in-flight install)
  // that started against an older catalog can detect it went stale.
  let loadGeneration = 0;

  function init(p: SpecoratorPlugin): void {
    plugin ??= p;
  }

  function requirePlugin(): SpecoratorPlugin {
    if (!plugin) throw new Error('Marketplace store used before init(plugin).');
    return plugin;
  }

  function resolveSource(): string {
    const raw = requirePlugin().settings.marketplaceSourceUrl?.trim() || DEFAULT_MARKETPLACE_BASE_URL;
    // Canonicalize to match what MarketplaceCatalogClient's constructor stores as
    // its base: the cache is keyed on this source, and a fetch that succeeds under
    // the client's canonical URL must read/write the SAME key here — otherwise a
    // non-canonical custom source (`…:443/`, uppercase host) would cache under one
    // spelling and the offline fallback would look under another and always miss.
    const withSlash = raw.endsWith('/') ? raw : `${raw}/`;
    try {
      return new URL(withSlash).toString();
    } catch {
      return withSlash;
    }
  }

  /**
   * The network opt-in, re-read at every I/O boundary. A mounted leaf can outlive
   * the user toggling `marketplaceNetworkEnabled` off in settings, so gating only
   * at mount would let Refresh/Preview keep dialing; check it here instead.
   */
  function assertNetworkEnabled(): void {
    if (requirePlugin().settings.marketplaceNetworkEnabled !== true) {
      throw new MarketplaceError('Marketplace networking is disabled.');
    }
  }

  function clientFor(baseUrl: string): MarketplaceCatalogClient {
    return new MarketplaceCatalogClient(baseUrl);
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
    // Scan the agent roster at most once per refresh (not once per agent item);
    // an unreadable roster degrades to "no agents marked", never a thrown scan.
    let rosterIds: ReadonlySet<string> | undefined;
    if (items.value.some((item) => item.type === 'agent')) {
      try {
        rosterIds = new Set((await deps.rosterStore.list()).map((agent) => agent.id));
      } catch {
        rosterIds = new Set<string>();
      }
    }
    const ids = new Set<string>();
    for (const item of items.value) {
      try {
        if (await isItemInstalled(item, deps, rosterIds)) ids.add(item.id);
      } catch {
        // a folder-resolution hiccup shouldn't blank the whole list
      }
    }
    installedIds.value = ids;
  }

  /**
   * Atomically swap in a freshly loaded catalog: its items, the source they came
   * from, and a bumped generation all flip TOGETHER. Keeping them in lockstep is
   * what lets an in-flight preview/install that began against the OLD catalog
   * (still rendered during the fetch) detect the switch — the old source stays
   * bound and the older generation was captured — instead of leaking the new
   * source's content, or a stale install mark, under an old item's id.
   */
  function commitCatalog(newItems: MarketplaceItem[], src: string, isOffline: boolean): void {
    items.value = newItems;
    source.value = src;
    loadGeneration += 1;
    offline.value = isOffline;
  }

  /** Fetches the catalog; on failure falls back to the cached copy for the same source. */
  async function load(): Promise<void> {
    if (loading.value) return;
    loading.value = true;
    error.value = null;
    const src = resolveSource();
    try {
      assertNetworkEnabled();
      const manifest = await clientFor(src).fetchIndex();
      commitCatalog(manifest.items, src, false);
      // Cache persistence is a best-effort optimization — a write failure
      // (permissions, transient FS) must not discard the catalog we just
      // fetched, so it stays out of the fetch-error fallback below.
      try {
        await cache().write(manifest, src, Date.now());
      } catch {
        // The online catalog is already shown; losing the cache is harmless.
      }
    } catch (fetchError) {
      const cached = await cache().read();
      if (cached && cached.source === src) {
        commitCatalog(cached.manifest.items, src, true);
      } else {
        commitCatalog([], src, false);
        error.value =
          fetchError instanceof MarketplaceError || fetchError instanceof Error
            ? fetchError.message
            : String(fetchError);
      }
    } finally {
      loading.value = false;
      await refreshInstalled();
    }
  }

  /**
   * Fetches one item's raw body (for the preview pane) from the source the
   * CURRENT catalog was loaded from (`source.value`) — NOT the live setting. If
   * the user edits `marketplaceSourceUrl` without refreshing, the displayed items
   * still belong to the old source, so their paths must resolve against it.
   */
  async function fetchBody(item: MarketplaceItem): Promise<string> {
    assertNetworkEnabled();
    return clientFor(source.value).fetchItemBody(item.path);
  }

  /**
   * Installs the exact body the user reviewed in the preview — passed in by the
   * caller rather than re-fetched, so what lands in the vault is what was shown
   * (no re-dial, no chance the remote changed between preview and install). This
   * is also why install issues no network request and needs no opt-in guard.
   */
  async function install(item: MarketplaceItem, body: string): Promise<InstallOutcome> {
    const generation = loadGeneration;
    const outcome = await installMarketplaceItem(item, body, installDeps(), Date.now());
    // If the catalog reloaded during the vault write (Refresh / source switch,
    // possibly from another leaf), a later refreshInstalled already recomputed
    // installedIds against the new catalog — blindly adding this id could
    // falsely mark a reused id installed, so only optimistically mark when the
    // catalog is still the one this install ran against.
    if (generation === loadGeneration) {
      const next = new Set(installedIds.value);
      next.add(item.id);
      installedIds.value = next;
    }
    return outcome;
  }

  return {
    items,
    installedIds,
    loading,
    error,
    offline,
    source,
    init,
    load,
    fetchBody,
    install,
  };
});
