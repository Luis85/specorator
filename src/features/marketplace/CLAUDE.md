# Marketplace Feature

A dedicated Vue 3 + Pinia island (`VIEW_TYPE_MARKETPLACE`, `store` ribbon,
`open-marketplace` command) that browses a remote catalog and installs items
into the vault Library. Replaces the deleted bundled starter presets (ADR 0007).
Modeled on — and reuses the components of — `features/library`.

## Layout

| File | Role |
|------|------|
| `catalogTypes.ts` | `MarketplaceItem`/`MarketplaceManifest` types, `parseManifest` (validates `schemaVersion`, drops malformed items, dedupes by id), `INSTALLABLE_ITEM_TYPES` (excludes `skill`) + `isInstallableType` |
| `MarketplaceCatalogClient.ts` | HTTP fetch over Obsidian `requestUrl`; `fetchIndex()` + `fetchItemBody(path)`. Injectable `request`/`vet` seams (default: `requestUrl` + `assertSafeRemoteUrl`) |
| `MarketplaceCache.ts` | Schema-versioned JSON cache at `.specorator/cache/marketplace-index.json`; cold-safe `read()`/`write()` via `writeAtomic` |
| `MarketplaceInstaller.ts` | `installMarketplaceItem(item, body, deps, now)` routes to the same vault stores the app uses; `isItemInstalled(item, deps, rosterIds?)` drives the badge |
| `MarketplaceView.ts` / `activateMarketplace.ts` / `viewType.ts` | `ItemView` host (per-leaf Vue app), leaf activation, view-type constant |
| `marketplaceNetworkGate.ts` | One-time in-app Notice on first opt-in |
| `vue/MarketplaceRoot.vue` | Opt-in gate, type facet, `LibraryToolbar` + `useLibraryList` reuse, load/preview/install orchestration, offline/error banners |
| `vue/components/MarketplaceCard.vue` | Per-item card (type badge, preview, attribution, gated Install) |
| `vue/marketplaceTypeLabels.ts` | Localized `type → label` map shared by the card badge and the type facet |
| `vue/useMarketplaceInstalledRefresh.ts` | Per-leaf composable: debounced `store.refreshInstalled()` on `roster:changed` (agents) + folder-scoped vault create/delete/rename (loops/templates/quick-actions) |
| `vue/stores/marketplaceStore.ts` | Shared Pinia store over one Pinia per plugin (all leaves share fetched catalog + installed state) |

## Contracts & invariants

- **Network is opt-in, enforced at the I/O boundary.** The store re-reads
  `plugin.settings.marketplaceNetworkEnabled` in `load()`/`fetchBody()` on every
  call (not just at view mount), so disabling it stops all `requestUrl` calls
  immediately; a disabled `load` serves the on-disk cache and constructs no
  client. Config lives on the **Marketplace settings tab** (registered in
  `settings/registry/fields/marketplace.ts`; it is a fixed registry-rendered tab
  — see `settingsTabStrip.ts` `FIXED_TAB_IDS` + `featureFlag.ts`
  `STATIC_REGISTRY_TABS`, both of which must list `marketplace` or the tab never
  renders) and, for the toggle only, the view's Enable button.
- **Install writes the reviewed body.** `MarketplaceRoot` passes the
  already-previewed body into `store.install(item, body)`; the store does NOT
  re-fetch (no TOCTOU, no re-dial), and the Install button stays disabled until
  that body has loaded. Loops/templates/quick-actions are written **verbatim**
  (provenance frontmatter preserved); agents parse into a `RosterAgent`.
- **Agent identity keys on the manifest `item.name`** (via `agentRosterId`),
  used identically by the installer and `isItemInstalled`, so the "Installed"
  badge can't drift from what was written. Installed agents also carry a
  `catalog` provenance block (`{ id, source?, author?, license?, version? }`) on
  the `RosterAgent`, populated from the manifest item. `isItemInstalled` then
  matches on the roster id **or** the stored catalog id (`installedAgentKeys`) —
  the catalog id keeps an agent recognized across a catalog-side display-name
  rebrand, while the roster-id fallback keeps pre-provenance/hand-authored agents
  recognized. The storage/dedup key stays the name-slug roster id (no file
  churn); cross-rename install idempotency is deferred update-management.
- **The catalog is untrusted.** `item.source` is only linkified when it is an
  `http(s)` URL (`MarketplaceCard` `safeSourceUrl`) — never a live `javascript:`
  href. Every fetched URL is SSRF-vetted AND constrained to stay under the
  configured base URL (`MarketplaceCatalogClient.resolve`). Two SSRF residuals
  remain because `requestUrl` is a high-level API with no socket hooks — DNS
  rebinding (the vet is preflight-only; `createPinnedLookup` can't attach) and
  HTTP-redirect following (3xx is auto-followed with no `Location` re-vet). Both
  are bounded to a non-default, user-configured source; closing them means moving
  off `requestUrl` (see the `MarketplaceCatalogClient` class doc).
- **Installed badges live-sync across two channels.** A mutation OUTSIDE the
  marketplace (a Library delete/rename, a roster change) recomputes `installedIds`
  without a manual Refresh, via `useMarketplaceInstalledRefresh`. Installed-state
  spans two signals: agents fire `roster:changed` on the event bus, while
  loop/template/quick-action notes surface only as Obsidian vault
  create/delete/rename events under their folders (existence-only — `modify` is
  irrelevant). Both feed a debounced `store.refreshInstalled`, which is
  network-free and double-guarded: a **generation** guard rejects a scan the
  catalog reloaded under, and a **sequence** guard rejects an older scan a newer
  overlapping scan already superseded (event-triggered scans can now run
  concurrently with no reload, so ordering can't rely on generation alone). The
  composable is owned per-leaf (`onMounted`/
  `onUnmounted` teardown: disposer + `offref` + timer clear); the shared store
  means every open leaf subscribes independently and each fires the same
  idempotent refresh — leak-free because teardown is per-leaf, NOT in `store.init`.
- **Preview cache is generation-guarded.** Previews are keyed by item id and
  cleared when the catalog reloads; an in-flight fetch that resolves after a
  reload is discarded via `catalogGeneration` so a stale body can't repopulate a
  reused id.
- **The type facet is marketplace-local.** Filtering by asset type is an OUTER
  pre-filter on the `useLibraryList` source getter (`activeTypes`), so the shared
  search/sort/tag facet operates on the type-narrowed subset and its tag chips
  recompute from it. It is deliberately NOT threaded through the shared
  `LibraryToolbar`/`useLibraryList` — the four Library panels are each already
  one-type-per-tab and would inherit a facet they can't use. Chips show only the
  types present in the catalog (hidden entirely below two), and a stranded filter
  is pruned when its type leaves a reloaded catalog (mirrors the tag prune).
- **Skills are deferred.** `INSTALLABLE_ITEM_TYPES` excludes `skill`; adding it
  there plus an installer branch is the whole extension point.

## Tests

`tests/unit/features/marketplace/` (catalog types, client, cache, installer) and
`tests/vue/marketplace/` (root, store, card). The settings-tab rendering
regression lives in `tests/integration/settings/marketplaceTab.test.ts`.
