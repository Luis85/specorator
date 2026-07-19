# Marketplace Feature

A dedicated Vue 3 + Pinia island (`VIEW_TYPE_MARKETPLACE`, `store` ribbon,
`open-marketplace` command) that browses a remote catalog and installs items
into the vault Library. Replaces the deleted bundled starter presets (ADR 0007).
Modeled on — and reuses the components of — `features/library`.

## Layout

| File | Role |
|------|------|
| `catalogTypes.ts` | `MarketplaceItem`/`MarketplaceManifest` types, `parseManifest` (validates `schemaVersion`, drops malformed items, dedupes by id **and** per-type install key), `INSTALLABLE_ITEM_TYPES` (excludes `skill`) + `isInstallableType` |
| `MarketplaceCatalogClient.ts` | HTTP fetch over Obsidian `requestUrl`; `fetchIndex()` + `fetchItemBody(path)`. Injectable `request`/`vet` seams (default: `requestUrl` + `assertSafeRemoteUrl`) |
| `MarketplaceCache.ts` | Schema-versioned JSON cache at `.specorator/cache/marketplace-index.json`; cold-safe `read()`/`write()` via `writeAtomic` |
| `MarketplaceInstaller.ts` | `installMarketplaceItem(item, body, deps, now)` routes to the same vault stores the app uses; `isItemInstalled(item, deps, rosterIds?)` drives the badge |
| `MarketplaceView.ts` / `activateMarketplace.ts` / `viewType.ts` | `ItemView` host (per-leaf Vue app), leaf activation, view-type constant |
| `marketplaceNetworkGate.ts` | One-time in-app Notice on first opt-in |
| `vue/MarketplaceRoot.vue` | Opt-in gate, type facet, `LibraryToolbar` + `useLibraryList` reuse, load/preview/install orchestration, offline/error banners |
| `vue/components/MarketplaceCard.vue` | Per-item card (type badge, preview, attribution, gated Install) |
| `vue/marketplaceTypeLabels.ts` | Localized `type → label` map shared by the card badge and the type facet |
| `vue/useMarketplaceInstalledRefresh.ts` | Per-leaf composable: debounced `store.refreshInstalled()` on three channels — `roster:changed` (agents), folder-scoped vault create/delete/rename (loops/templates/quick-actions), and `settings-changed` (an install-folder setting change) |
| `vue/stores/marketplaceStore.ts` | Shared Pinia store over one Pinia per plugin (all leaves share fetched catalog + installed state) |

## Contracts & invariants

- **Network is opt-in, enforced at the I/O boundary.** The store re-reads
  `plugin.settings.marketplaceNetworkEnabled` in `load()`/`fetchBody()` on every
  call (not just at view mount), so disabling it stops all `requestUrl` calls
  immediately; a disabled `load` serves the on-disk cache and constructs no
  client. The view auto-loads only on the first enabled mount that finds the
  shared store empty (`store.loaded`) — the module-singleton store retains the
  catalog across leaf open/close, so reopening a leaf or opening a second one
  reuses it and refreshes on demand (the Refresh button), not on every mount.
  A reuse-mount still runs one initial `refreshInstalled` (network-free), because
  no live-sync subscription was active while every leaf was closed — otherwise a
  mutation made in that window would leave stale Installed badges until the next
  event or a manual Refresh.
  `loaded` tracks whether the latest load **landed a catalog** (online or cache),
  NOT the item count — a valid but empty catalog is loaded (so reopen reuses it);
  only a hard failure with no matching cache stays unloaded, so that case retries.
  Config lives on the **Marketplace settings tab** (registered in
  `settings/registry/fields/marketplace.ts`; it is a fixed registry-rendered tab
  — see `settingsTabStrip.ts` `FIXED_TAB_IDS` + `featureFlag.ts`
  `STATIC_REGISTRY_TABS`, both of which must list `marketplace` or the tab never
  renders) and, for the toggle only, the view's Enable button.
- **Install writes the reviewed body.** `MarketplaceRoot` passes the
  already-previewed body into `store.install(item, body)`; the store does NOT
  re-fetch (no TOCTOU, no re-dial), and the Install button stays disabled until
  that body has loaded. Loops/templates/quick-actions are written **verbatim**
  (provenance frontmatter preserved); agents parse into a `RosterAgent`.
  Install-target folders resolve with `??` (matching `main.ts`), so an
  explicitly-blank Quick Actions folder stays blank and the installer refuses the
  write (`hasConfiguredFolder`) instead of silently landing it in a default
  folder the Library — also treating blank as unconfigured — never scans.
  `isItemInstalled` guards the same way (returns not-installed for a blank folder
  rather than probing the vault-root path `getFilePathForName` would derive), so
  an unrelated root note sharing the slug can't false-mark the badge Installed.
- **Agent identity keys on the manifest `item.name`** (via `agentRosterId`),
  used identically by the installer and `isItemInstalled`, so the "Installed"
  badge can't drift from what was written. Installed agents also carry a
  `catalog` provenance block (`{ id, catalogUrl?, source?, author?, license?,
  version? }`) on the `RosterAgent`, populated from the manifest item plus the
  committed catalog base URL the displayed catalog loaded from (`source.value`,
  NOT the live `marketplaceSourceUrl` setting — matching fetchBody/previews, so
  editing the source without a refresh can't stamp the pending source into an
  agent installed from the shown one). `isItemInstalled` then
  matches on the roster id **or** the **source-scoped** catalog id
  (`installedAgentKeys` keys it as `<catalogUrl>\0<id>`) — the scoped catalog id
  keeps an agent recognized across a catalog-side display-name rebrand *from the
  same source*, while the roster-id fallback keeps pre-provenance/hand-authored
  agents recognized. Scoping to `catalogUrl` is what stops a fork at a different
  `marketplaceSourceUrl` that **reuses** a catalog id from false-matching a
  different agent's installed check (the bare id is only meaningful within one
  catalog). The storage/dedup key stays the name-slug roster id (no file
  churn); cross-rename install idempotency is deferred update-management.
  `cloneRosterAgent` strips `catalog` — a clone is a user-owned derivative, not
  the catalog item, so it must not keep the provenance (else after the original
  is deleted the clone's catalog id would still satisfy the installed check and
  wrongly hide the item's Install action).
- **The catalog is untrusted.** `item.source` is only linkified when it is an
  `http(s)` URL (`MarketplaceCard` `safeSourceUrl`) — never a live `javascript:`
  href. Every fetched URL is SSRF-vetted AND constrained to stay under the
  configured base URL (`MarketplaceCatalogClient.resolve`). `parseManifest` also
  rejects any item whose `id` isn't the expected lowercase `<folder>/<slug>`
  shape (`CATALOG_ID_PATTERN`) — the view keys plain-object caches
  (`bodies`/`previewErrors`/`installing`) by id, so an `Object.prototype` name
  like `__proto__`/`toString` would otherwise read as already-present or pollute
  a record prototype — and rejects any item whose **name doesn't survive
  normalization to a non-empty install slug** (`hasInstallableName`): a blank,
  punctuation-only, or non-ASCII name (`计划`) slugifies to the installer's shared
  ASCII per-type fallback (`loop`/`template`/…) and collides.
  `parseManifest` also dedupes by a **per-type install key**
  (`<type>:<normalized-name-slug>`) on top of the id-dedup: every installer
  derives its target filename / roster id from the normalized name, so two items
  with different ids whose names normalize to the same slug (only reachable when
  a custom catalog decouples the id from the name-slug) would install to the SAME
  target — keeping the first prevents installing one from flipping both cards to
  Installed and hiding the other's Install action. At install, **every** note
  payload (loop/template/quick-action) is identity-checked through the shared
  `assertPayloadPath`: the body's frontmatter name must slugify to the SAME path
  as the manifest name, so a body that names a different item than its catalog
  entry is refused rather than written under the manifest's filename while the
  Library shows the payload's name. Two SSRF residuals
  remain because `requestUrl` is a high-level API with no socket hooks — DNS
  rebinding (the vet is preflight-only; `createPinnedLookup` can't attach) and
  HTTP-redirect following (3xx is auto-followed with no `Location` re-vet). Both
  are bounded to a non-default, user-configured source; closing them means moving
  off `requestUrl` (see the `MarketplaceCatalogClient` class doc).
- **Installed badges live-sync across three channels.** A mutation OUTSIDE the
  marketplace (a Library delete/rename, a roster change, an install-folder setting
  change) recomputes `installedIds` without a manual Refresh, via
  `useMarketplaceInstalledRefresh`. Installed-state spans three signals: agents
  fire `roster:changed` on the event bus; loop/template/quick-action notes surface
  as Obsidian vault create/delete/rename events under their folders (existence-only
  — `modify` is irrelevant); and a `settings-changed` event covers a change to the
  configured install FOLDERS (which moves where an item lives — and so which items
  count as installed — with no accompanying vault event). All feed a debounced
  `store.refreshInstalled`, which is network-free and double-guarded: a
  **generation** guard rejects a scan the catalog reloaded under, and a
  **sequence** guard rejects an older scan a newer overlapping scan already
  superseded (event-triggered scans can now run concurrently with no reload, so
  ordering can't rely on generation alone). The composable is owned per-leaf
  (`onMounted`/`onUnmounted` teardown: disposers + `offref` + timer clear); the
  shared store means every open leaf subscribes independently and each fires the
  same idempotent refresh — leak-free because teardown is per-leaf, NOT in
  `store.init`.
- **Settings changes reach an open leaf via `settings-changed`.** `plugin.settings`
  is a plain, non-reactive object and Obsidian Settings is a modal over the active
  leaf (so `active-leaf-change` can't be relied on when a setting is toggled and
  the modal dismissed). `saveSettings` — the single persistence path for every
  field (registry renderer + imperative sections) — emits one general
  `settings-changed` event (`features/settings/events.ts`). `MarketplaceRoot`
  subscribes to re-read the opt-in gate (`enabled`): flipping
  `marketplaceNetworkEnabled` on the Settings tab now warns + loads the open leaf
  without a manual Enable click or remount. The install-refresh composable
  subscribes for the folder-change case above. Both own per-leaf teardown.
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
