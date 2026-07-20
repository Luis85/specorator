import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';

import { HomeFileAdapter } from '../../../../core/storage/HomeFileAdapter';
import type SpecoratorPlugin from '../../../../main';
import { refreshSkillCatalogBestEffort } from '../../../skills/refreshSkillCatalogBestEffort';
import { isBinarySkillPath, type MarketplaceItem, MAX_SKILL_FILES, skillFolderPrefix } from '../../catalogTypes';
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
import type {
  SkillInstallScope,
  SkillInstallTarget,
  SkillProviderTarget,
} from '../../skillInstallTargets';

/** Bounded parallelism for fetching a multi-file skill's supporting files. */
const SKILL_FETCH_CONCURRENCY = 6;

// Bounds on a multi-file skill download from an (untrusted) custom catalog source, so a
// manifest declaring thousands of files or very large bodies can't exhaust renderer
// memory or bandwidth. Sized well above the first-party catalog's skills (project-setup:
// 138 files, ~370 KB). Measured in string length (≈ bytes for the UTF-8 text these must be).
export const MAX_SKILL_FILE_CHARS = 1_000_000;
export const MAX_SKILL_TOTAL_CHARS = 10_000_000;

/**
 * Runs `fn` over `items` with at most `limit` in flight, preserving input order
 * in the result. On the first failure it stops pulling new work (so a mid-batch
 * error — a 404 or a size-cap throw — doesn't keep firing requests) AND waits for
 * the in-flight workers to settle before rejecting with that first error, so no
 * request is still running when the caller re-enables the UI or a retry begins.
 * Kept local — no external dependency.
 */
async function fetchWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  let failed = false;
  let failure: unknown;
  const worker = async (): Promise<void> => {
    while (cursor < items.length && !failed) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = await fn(items[index]);
      } catch (err) {
        if (!failed) {
          failed = true;
          failure = err;
        }
        return;
      }
    }
  };
  // allSettled (not Promise.all) so every worker's in-flight `fn` resolves before we
  // return — Promise.all would reject the instant one worker throws while the others
  // keep downloading. Re-throw the first captured error to preserve the reject contract.
  await Promise.allSettled(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  if (failed) throw failure;
  return results;
}

/**
 * Rejects a skill file map whose content isn't text — a NUL byte means a binary
 * was decoded as text (the plugin's UTF-8 write would corrupt it). Mirrors the
 * marketplace validator's source-side rule and catches binaries the extension
 * denylist can't (unlisted/extensionless formats).
 */
function assertTextOnlySkillContents(files: ReadonlyMap<string, string>): void {
  for (const [rel, content] of files) {
    if (content.includes(String.fromCharCode(0))) {
      throw new MarketplaceError(
        `This skill's file "${rel}" is not text (contains a NUL byte). Marketplace skills must be text-only.`,
      );
    }
  }
}

/** Rejects a skill that declares a binary file by extension (a fast pre-fetch
 *  check; content is re-verified after fetch in assertTextOnlySkillContents). */
function assertNoBinarySkillFiles(item: MarketplaceItem): void {
  const binaryFile = (item.files ?? []).find((path) => isBinarySkillPath(path));
  if (binaryFile) {
    throw new MarketplaceError(
      `This skill includes a non-text file ("${binaryFile}"), which can't be installed. Marketplace skills must be text-only.`,
    );
  }
}

/**
 * Enforces the per-file and running-aggregate size caps on one skill file's content
 * (`SKILL.md` included, so a marker-only skill can't slip a huge body past the bounds).
 * `budget.total` accumulates across calls; throws past either cap.
 */
function assertSkillFileWithinCaps(content: string, label: string, budget: { total: number }): void {
  if (content.length > MAX_SKILL_FILE_CHARS) {
    throw new MarketplaceError(
      `This skill's file "${label}" is too large to install (over ${MAX_SKILL_FILE_CHARS.toLocaleString()} characters).`,
    );
  }
  budget.total += content.length;
  if (budget.total > MAX_SKILL_TOTAL_CHARS) {
    throw new MarketplaceError(
      `This skill's files exceed the ${MAX_SKILL_TOTAL_CHARS.toLocaleString()}-character total limit for a marketplace install.`,
    );
  }
}

/**
 * Builds the in-skill file map: the reviewed `SKILL.md` verbatim, plus every
 * other file in `item.files` fetched from `sourceUrl` — the source snapshotted
 * when the install began, so a concurrent source switch can't split the skill.
 * Keys are in-skill relative paths (`scripts/setup.mjs`), values the content. A
 * single fetch failure rejects the whole map, so no partial skill is written;
 * a NUL-bearing (binary) file is rejected too, and every file (SKILL.md included)
 * is size-capped.
 *
 * Revision-consistency (item 10): the supporting files are fetched at install
 * time from the mutable source, while `skillMdBody` is the marker reviewed at
 * preview time. For a multi-file skill the marker is re-fetched after the batch
 * and must still equal what was reviewed — a catalog bump in that window would
 * otherwise pair the reviewed marker with newer supporting files (a hybrid
 * skill), so a drift aborts the install and asks for a re-review. The reviewed
 * body is still what's written; the re-fetch is a guard, not the source of truth.
 */
async function fetchSkillFiles(
  item: MarketplaceItem,
  skillMdBody: string,
  sourceUrl: string,
  assertNetwork: () => void,
): Promise<Map<string, string>> {
  const declared = item.files ?? [];
  if (declared.length > MAX_SKILL_FILES) {
    throw new MarketplaceError(
      `This skill declares ${declared.length} files, over the ${MAX_SKILL_FILES}-file limit for a marketplace install.`,
    );
  }
  // SKILL.md counts toward the caps first — a marker-only skill never runs the fetch
  // callback below, so its size must be checked here or it would bypass the bounds.
  const budget = { total: 0 };
  assertSkillFileWithinCaps(skillMdBody, 'SKILL.md', budget);
  const files = new Map<string, string>([['SKILL.md', skillMdBody]]);
  const prefix = skillFolderPrefix(item.path);
  const others = declared.filter((repoPath) => repoPath !== item.path);
  if (prefix !== null && others.length > 0) {
    const client = new MarketplaceCatalogClient(sourceUrl);
    const contents = await fetchWithConcurrency(others, SKILL_FETCH_CONCURRENCY, async (repoPath) => {
      // Re-read the opt-in before EVERY request (not just once at install start):
      // disabling networking mid-install must stop any not-yet-started fetch at
      // once — the Marketplace's "opt-out stops requestUrl immediately" contract.
      assertNetwork();
      const content = await client.fetchItemBody(repoPath);
      // Abort past the cap (with SKILL_FETCH_CONCURRENCY in flight the overshoot is
      // bounded) rather than buffering an oversized body from a custom source.
      assertSkillFileWithinCaps(content, repoPath, budget);
      return content;
    });
    await assertReviewedMarkerUnchanged(client, item.path, skillMdBody, assertNetwork);
    others.forEach((repoPath, index) => {
      const rel = repoPath.startsWith(prefix) ? repoPath.slice(prefix.length) : null;
      if (rel) files.set(rel, contents[index]);
    });
  }
  assertTextOnlySkillContents(files);
  return files;
}

/**
 * Re-fetches the skill's `SKILL.md` from the source and requires it still equals
 * the reviewed body — the plugin-only revision guard (item 10). It only narrows,
 * not closes, the hybrid window: a bump that rewrites a supporting file WITHOUT
 * touching `SKILL.md` still passes (the reviewed marker is then still accurate,
 * only the scripts moved). Closing that residual needs per-file content hashes in
 * the reviewed index or pinning to an immutable revision (cross-repo) — see the
 * tech-debt note. The re-fetch isn't size-capped: on a match it equals the
 * already-counted reviewed body; on a mismatch the install aborts regardless.
 */
async function assertReviewedMarkerUnchanged(
  client: MarketplaceCatalogClient,
  markerPath: string,
  reviewedBody: string,
  assertNetwork: () => void,
): Promise<void> {
  assertNetwork();
  const currentMarker = await client.fetchItemBody(markerPath);
  if (currentMarker !== reviewedBody) {
    throw new MarketplaceError(
      'This skill changed in the catalog since you reviewed it. Refresh the Marketplace and review it again before installing.',
    );
  }
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

  /** Fetches a skill's supporting files (network) and installs the whole folder. */
  async function installSkillAt(
    item: MarketplaceItem,
    skillMdBody: string,
    target: SkillInstallTarget,
  ): Promise<InstallOutcome> {
    assertNetworkEnabled();
    // Snapshot the source at install start: a concurrent leaf refresh/source-switch
    // must not split one skill across two catalogs (marker from the reviewed source,
    // scripts from the new one). All this install's fetches use `installSource`.
    const installSource = source.value;
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
