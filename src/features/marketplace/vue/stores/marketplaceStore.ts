import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';

import { ProviderRegistry } from '../../../../core/providers/ProviderRegistry';
import { HomeFileAdapter } from '../../../../core/storage/HomeFileAdapter';
import { asSettingsBag } from '../../../../core/types';
import type SpecoratorPlugin from '../../../../main';
import { refreshSkillCatalogBestEffort } from '../../../skills/refreshSkillCatalogBestEffort';
import { type MarketplaceItem, normalizeInstallSlug } from '../../catalogTypes';
import type { InstallOutcome, MarketplaceInstallDeps } from '../../installerTypes';
import { MarketplaceCache } from '../../MarketplaceCache';
import {
  DEFAULT_MARKETPLACE_BASE_URL,
  MarketplaceCatalogClient,
  MarketplaceError,
} from '../../MarketplaceCatalogClient';
import {
  installedAgentKeys,
  installMarketplaceItem,
  isItemInstalled,
} from '../../MarketplaceInstaller';
import { installPackage, type PackageInstallResult } from '../../packageInstall';
import { describePackageFailure, indexCatalog, resolvePackage } from '../../packageResolution';
import { assertNoBinarySkillFiles, fetchSkillFiles } from '../../skillFileFetch';
import { installSkillItem, isSkillInstalledAt as skillInstalledAtTarget } from '../../skillInstall';
import type {
  SkillInstallScope,
  SkillInstallTarget,
  SkillProviderTarget,
} from '../../skillInstallTargets';

/**
 * Aborts a user-scope install whose provider no longer supports installing user-scope
 * skills under the CURRENT settings (Codex switching to WSL, Claude's `loadUserSettings`
 * disabled). The detail selector blocks NEW user-scope picks reactively; this is the
 * write-time parallel — a target captured while it was supported must not silently write
 * to host home the runtime no longer scans. Project-scope installs are never gated.
 */
function assertUserScopeStillInstallable(target: SkillInstallTarget, plugin: SpecoratorPlugin): void {
  if (
    target.scope === 'user' &&
    !ProviderRegistry.installsUserScopeSkills(target.provider, asSettingsBag(plugin.settings))
  ) {
    throw new MarketplaceError(
      `${target.provider} can no longer install user-scope skills with the current settings — re-open the skill and choose a target again.`,
    );
  }
}

/** The vault/home surface every install writes through, resolved from live settings. */
function buildInstallDeps(p: SpecoratorPlugin, catalogUrl: string): MarketplaceInstallDeps {
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
    catalogUrl,
  };
}

/**
 * The skill names to grant an agent on install: every skill in its own package,
 * normalized to the slug the skill installs under — which is also the name
 * `VaultSkillAggregator` reports and the roster editor keys on. Empty for a
 * non-agent, or an agent whose package doesn't resolve (the caller's own
 * resolution already failed the install in that case).
 */
function boundSkillNames(
  item: MarketplaceItem,
  byId: ReadonlyMap<string, MarketplaceItem>,
): string[] {
  if (item.type !== 'agent') return [];
  const resolution = resolvePackage(item, byId);
  if (!resolution.ok) return [];
  return resolution.dependencies
    .filter((dependency) => dependency.type === 'skill')
    .map((dependency) => normalizeInstallSlug(dependency.name));
}

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

  // `source.value` — the source the DISPLAYED catalog committed to, NOT the live
  // setting (same as fetchBody/previews): if the user edits marketplaceSourceUrl
  // without refreshing, an install/scan still belongs to the shown catalog, so
  // agent provenance is stamped and matched against that source, not the pending one.
  function installDeps(): MarketplaceInstallDeps {
    return buildInstallDeps(requirePlugin(), source.value);
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
    return fetchBodyFrom(item, source.value);
  }

  /** `fetchBody` against an explicit source — the one an in-flight install
   *  snapshotted, so a concurrent refresh can't split a package across catalogs. */
  async function fetchBodyFrom(item: MarketplaceItem, src: string): Promise<string> {
    assertNetworkEnabled();
    return clientFor(src).fetchItemBody(item.path);
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
  ): Promise<PackageInstallResult> {
    const generation = loadGeneration;
    // Snapshot the committed source for the WHOLE package: a dependency's body
    // and the root's reviewed body must come from one catalog, so a concurrent
    // leaf's refresh mid-install can't mix an agent from one source with skills
    // from another.
    const installSource = source.value;
    const byId = indexCatalog(items.value);
    const resolution = resolvePackage(item, byId);
    // A package that can't resolve (a dependency absent from this catalog, a
    // cycle, an oversized fan-out) installs NOTHING: writing the root alone would
    // leave an agent bound to skills that were never fetched.
    if (!resolution.ok) throw new MarketplaceError(describePackageFailure(resolution));

    // Deps PINNED to `installSource` for the whole package, not rebuilt from the
    // live `source.value`: a package awaits its dependencies before writing the
    // root, so another leaf can commit a different catalog inside that window —
    // and an agent whose body came from catalog A must not be stamped with B's
    // URL (that would let B's reused catalog id satisfy A's installed check).
    const pinnedDeps = (): MarketplaceInstallDeps => buildInstallDeps(requirePlugin(), installSource);
    const result = await installPackage(item, body, resolution.dependencies, target, installSource, {
      fetchBody: fetchBodyFrom,
      installSkill: installSkillAt,
      installItem: (member, memberBody, options) =>
        installMarketplaceItem(member, memberBody, pinnedDeps(), Date.now(), options),
      boundSkills: (member) => boundSkillNames(member, byId),
      requireSkillTarget,
    });

    // If the catalog reloaded during the write (Refresh / source switch, possibly
    // from another leaf), a later refreshInstalled already recomputed installedIds
    // against the new catalog — blindly adding these ids could falsely mark a
    // reused id installed, so only optimistically mark when it's still current.
    if (generation === loadGeneration) {
      const next = new Set(installedIds.value);
      for (const id of result.written) next.add(id);
      installedIds.value = next;
    }
    return result;
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
    // The source committed when the install began — snapshotted by the caller so a
    // queued install that waits here while another leaf reloads/switches the catalog
    // still fetches from the source its reviewed item/body came from (else the
    // reviewed marker pairs with supporting files from a different catalog), and so
    // every member of one package is fetched from the same catalog.
    installSource: string,
  ): Promise<InstallOutcome> {
    const key = `${target.provider} ${target.scope} ${normalizeInstallSlug(item.name)}`;
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
    assertUserScopeStillInstallable(target, requirePlugin());
    const outcome = await installSkillItem(item, files, target, installDeps());
    if (outcome === 'installed') {
      // Skill dot-folders bypass the vault watcher, so mirror skillLibraryStore's
      // post-write sequence: force-reload the owning provider's catalog (Codex
      // serves a short listing cache the event alone can't clear), so the new skill
      // shows in the Library / dropdown / run surfaces immediately instead of after
      // a TTL. The forced refresh runs BEFORE the event so a consumer that reloads
      // on it (the Library live-refresh, the aggregator) can't race the slow Codex
      // `skills/list` and cache the pre-install listing for the TTL. This event
      // also drives the marketplace's own badge refresh (useMarketplaceInstalledRefresh).
      const p = requirePlugin();
      await refreshSkillCatalogBestEffort(p, target.provider);
      p.events.emit('vaultSkill.changed', { providerId: target.provider });
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
