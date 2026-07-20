import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';

import { HomeFileAdapter } from '../../../../core/storage/HomeFileAdapter';
import type SpecoratorPlugin from '../../../../main';
import { refreshSkillCatalogBestEffort } from '../../../skills/refreshSkillCatalogBestEffort';
import { type MarketplaceItem, normalizeInstallSlug } from '../../catalogTypes';
import { MarketplaceCache } from '../../MarketplaceCache';
import {
  DEFAULT_MARKETPLACE_BASE_URL,
  MarketplaceCatalogClient,
  MarketplaceError,
} from '../../MarketplaceCatalogClient';
import {
  installedAgentKeys,
  installMarketplaceItem,
  type InstallOutcome,
  installSkillItem,
  isItemInstalled,
  isSkillInstalledAt as skillInstalledAtTarget,
  type MarketplaceInstallDeps,
} from '../../MarketplaceInstaller';
import { assertNoBinarySkillFiles, fetchSkillFiles } from '../../skillFileFetch';
import type {
  SkillInstallScope,
  SkillInstallTarget,
  SkillProviderTarget,
} from '../../skillInstallTargets';

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
  /**
   * True once a load has populated the catalog. The shared (module-singleton)
   * store retains the catalog across leaf open/close, so the view auto-loads only
   * when this is false — reopening a leaf or opening a second one reuses the
   * loaded catalog and refreshes on demand (the Refresh button) instead of
   * re-fetching index.json on every mount.
   */
  const loaded = ref(false);
  const source = ref(DEFAULT_MARKETPLACE_BASE_URL);
  // Bumped whenever a new catalog load begins, so async work (an in-flight install)
  // that started against an older catalog can detect it went stale.
  let loadGeneration = 0;
  // Bumped at the start of every installed scan. Since Improvement C, external
  // vault/roster events can trigger overlapping refreshInstalled() calls with NO
  // catalog reload (same loadGeneration), so the generation guard alone can't
  // order them; only the latest-started scan commits its result.
  let installedScanSeq = 0;
  // Serializes skill installs by DESTINATION folder (provider+scope+normalized name) —
  // the real write-collision boundary, NOT `item.id`. The store is shared across every
  // open leaf, so a double-click, two live leaves, or a catalog refresh that reuses an
  // id (changed content) or maps a new name to the same slug could otherwise write and
  // roll back the same folder concurrently. Installs to one folder chain (tail promise
  // kept here); each runs its own install, so none rides another's outcome.
  const skillInstallQueue = new Map<string, Promise<InstallOutcome>>();

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
      // User-scope skill installs write outside the vault (home dir). A fresh
      // HomeFileAdapter is cheap and stateless (rooted at os.homedir()).
      homeAdapter: new HomeFileAdapter(),
      rosterStore: p.agentRosterStore,
      loopFolder: p.settings.agentBoardLoopFolder || 'Agent Board/loops',
      templateFolder: p.settings.agentBoardTemplateFolder || 'Agent Board/templates',
      // Preserve an explicitly-blank folder with `??` (matching main.ts), not
      // `||`: a blank means the Quick Actions feature is unconfigured, and the
      // installer refuses the install rather than silently writing to a default
      // folder the Library never scans.
      quickActionsFolder: p.settings.quickActionsFolder ?? 'Quick Actions',
      // The source the DISPLAYED catalog committed to (`source.value`), NOT the
      // live setting — same as fetchBody/previews. If the user edits
      // marketplaceSourceUrl without refreshing, an install/scan still belongs to
      // the shown catalog, so its agent provenance must be stamped/matched
      // against that source, not the pending new one.
      catalogUrl: source.value,
    };
  }

  async function refreshInstalled(): Promise<void> {
    // Capture the catalog generation up front. `load()`'s finally clears
    // `loading` BEFORE awaiting this scan, so a concurrent load() (another shared
    // leaf, or a Refresh during a long scan) can commit a replacement catalog and
    // run its own scan while this one is still awaiting per-item checks. Without
    // the guard, a slow scan finishing last would clobber `installedIds` with ids
    // computed from the now-stale catalog — so only commit if still current.
    const generation = loadGeneration;
    const seq = ++installedScanSeq;
    const deps = installDeps();
    // Scan the agent roster at most once per refresh (not once per agent item);
    // an unreadable roster degrades to "no agents marked", never a thrown scan.
    // The key set carries both roster ids and catalog ids (installedAgentKeys) so
    // the agent badge matches on either without a per-item roster scan.
    let agentKeys: ReadonlySet<string> | undefined;
    if (items.value.some((item) => item.type === 'agent')) {
      try {
        agentKeys = installedAgentKeys(await deps.rosterStore.list());
      } catch {
        agentKeys = new Set<string>();
      }
    }
    const ids = new Set<string>();
    for (const item of items.value) {
      try {
        if (await isItemInstalled(item, deps, agentKeys)) ids.add(item.id);
      } catch {
        // a folder-resolution hiccup shouldn't blank the whole list
      }
    }
    // Two independent staleness guards: `generation` rejects a scan the catalog
    // reloaded under (covers the commitCatalog→reload-scan window); `seq` rejects
    // an older scan that a newer overlapping scan (no reload) already superseded.
    if (generation === loadGeneration && seq === installedScanSeq) {
      installedIds.value = ids;
    }
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
    // Did a catalog LAND (online or from cache)? True even when it's validly
    // empty; false only on a hard failure with no matching cache. Drives `loaded`
    // below, so item count never conflates "empty" with "not loaded".
    let landed = true;
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
        landed = false;
        error.value =
          fetchError instanceof MarketplaceError || fetchError instanceof Error
            ? fetchError.message
            : String(fetchError);
      }
    } finally {
      loading.value = false;
      // Reflect the LATEST load outcome, not a one-way latch, and key it on
      // whether a catalog landed — NOT the item count. A valid but empty catalog
      // is loaded (reopening reuses it instead of re-fetching); only a hard
      // failure with no matching cache stays false, so that case retries on
      // close+reopen instead of caching an empty error state forever.
      loaded.value = landed;
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
   * (no re-dial for the reviewed body). Non-skill installs issue no network
   * request and need no opt-in guard.
   *
   * Skills are the exception: they are multi-file, so the reviewed `SKILL.md` is
   * written verbatim while the supporting files ARE fetched at install time
   * (guarded by the network opt-in and the same SSRF/containment checks). For a
   * multi-file skill the marker is also re-fetched and must still match the
   * reviewed body, so a mid-window catalog change can't pair the reviewed marker
   * with newer supporting files. A `target` (provider + scope) selects the root.
   */
  async function install(
    item: MarketplaceItem,
    body: string,
    target?: SkillInstallTarget,
  ): Promise<InstallOutcome> {
    const generation = loadGeneration;
    const outcome =
      item.type === 'skill'
        ? await installSkillAt(item, body, requireSkillTarget(target))
        : await installMarketplaceItem(item, body, installDeps(), Date.now());
    // If the catalog reloaded during the write (Refresh / source switch, possibly
    // from another leaf), a later refreshInstalled already recomputed installedIds
    // against the new catalog — blindly adding this id could falsely mark a reused
    // id installed, so only optimistically mark when the catalog is still current.
    if (generation === loadGeneration) {
      const next = new Set(installedIds.value);
      next.add(item.id);
      installedIds.value = next;
    }
    return outcome;
  }

  function requireSkillTarget(target?: SkillInstallTarget): SkillInstallTarget {
    if (!target) throw new MarketplaceError('Choose a provider and scope to install this skill.');
    return target;
  }

  /**
   * Serializes installs that target the SAME destination folder (provider + scope +
   * normalized skill name) — the real write-collision boundary, not `item.id`. Two
   * installs can hit one folder with different ids/content across a catalog refresh
   * (a replacement item reusing an id, or a different id whose name normalizes to the
   * same slug), so an id key would let them write and roll back the same directory
   * concurrently. Each queued install runs its OWN runSkillInstall — a later one hits
   * the "already installed" preflight skip — so no request rides another's result: the
   * reviewed content each caller picked is what its own run installs (or skips), never
   * silently swapped for a peer's. The `item.id`-keyed installed mark still happens per
   * caller in `install()`.
   */
  function installSkillAt(
    item: MarketplaceItem,
    skillMdBody: string,
    target: SkillInstallTarget,
  ): Promise<InstallOutcome> {
    const key = `${target.provider} ${target.scope} ${normalizeInstallSlug(item.name)}`;
    // Snapshot the committed source NOW, at enqueue — a queued install can wait here
    // while another leaf reloads/switches the catalog, and its fetches must use the
    // source its reviewed item/body came from, not whatever is committed after the wait
    // (else the reviewed marker pairs with supporting files from a different catalog).
    const installSource = source.value;
    const prior: Promise<unknown> = skillInstallQueue.get(key) ?? Promise.resolve();
    // Chain after any in-flight install to this folder; swallow the prior's error so
    // one failed install doesn't reject the whole queue waiting behind it.
    const run = prior.catch(() => {}).then(() => runSkillInstall(item, skillMdBody, target, installSource));
    skillInstallQueue.set(key, run);
    // Free the slot on settlement, but only if we're still the tail (a later enqueue
    // may have replaced us) so we never drop someone else's in-flight chain.
    void run
      .catch(() => {})
      .finally(() => {
        if (skillInstallQueue.get(key) === run) skillInstallQueue.delete(key);
      });
    return run;
  }

  /** Fetches a skill's supporting files (network) and installs the whole folder. */
  async function runSkillInstall(
    item: MarketplaceItem,
    skillMdBody: string,
    target: SkillInstallTarget,
    installSource: string,
  ): Promise<InstallOutcome> {
    // `installSource` was snapshotted at enqueue (installSkillAt), so a concurrent leaf
    // refresh/source-switch during a queued wait can't split one skill across two
    // catalogs (marker from the reviewed source, scripts from the new one). The network
    // opt-in is still re-checked HERE (run time), so an opt-out during the wait aborts.
    assertNetworkEnabled();
    // Preflight the target marker before downloading anything: if the skill is
    // already installed here, skip without fetching the folder — avoids a needless
    // full-folder download and a misleading "failed" notice if that download errors
    // for an already-present skill. installSkillItem re-checks race-safely at write.
    if (await skillInstalledAtTarget(item, target, installDeps())) return 'skipped';
    // Text-only: reject a declared binary by extension before fetching (fast path;
    // fetchSkillFiles also verifies by content). No wasted download, no corruption.
    assertNoBinarySkillFiles(item);
    const files = await fetchSkillFiles(item, skillMdBody, installSource, assertNetworkEnabled);
    const outcome = await installSkillItem(item, files, target, installDeps());
    if (outcome === 'installed') {
      // Skill dot-folders bypass the vault watcher, so mirror skillLibraryStore's
      // post-write sequence: invalidate the aggregator's TTL bucket AND force-reload
      // the owning provider's catalog (Codex serves a short listing cache the event
      // alone can't clear), so the new skill shows in the Library / dropdown / run
      // surfaces immediately instead of after a TTL. This also drives the
      // marketplace's own badge refresh (useMarketplaceInstalledRefresh subscribes).
      const p = requirePlugin();
      p.events.emit('vaultSkill.changed', { providerId: target.provider });
      await refreshSkillCatalogBestEffort(p, target.provider);
    }
    return outcome;
  }

  /** Whether the skill already exists at a specific target — drives the detail's per-target button. */
  async function isSkillInstalledAt(
    item: MarketplaceItem,
    provider: SkillProviderTarget,
    scope: SkillInstallScope,
  ): Promise<boolean> {
    return skillInstalledAtTarget(item, { provider, scope }, installDeps());
  }

  return {
    items,
    installedIds,
    loading,
    error,
    offline,
    loaded,
    source,
    init,
    load,
    fetchBody,
    install,
    isSkillInstalledAt,
    // Exposed so a per-leaf event subscription can recompute the installed badges
    // when items are mutated OUTSIDE the marketplace (Library delete/rename, roster
    // change). No network, generation-guarded — safe to call anytime.
    refreshInstalled,
  };
});
