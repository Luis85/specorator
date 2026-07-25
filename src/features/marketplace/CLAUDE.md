# Marketplace Feature

A dedicated Vue 3 + Pinia island (`VIEW_TYPE_MARKETPLACE`, `store` ribbon,
`open-marketplace` command) that browses a remote catalog and installs items
into the vault Library. Replaces the deleted bundled starter presets (ADR 0007).
Modeled on — and reuses the components of — `features/library`.

## Layout

| File | Role |
|------|------|
| `catalogTypes.ts` | `MarketplaceItem`/`MarketplaceManifest` types (skills carry a `files[]`; any item may carry a `requires[]`), `parseManifest` (validates `schemaVersion`, drops malformed items, dedupes by id **and** per-type install key, **sanitizes each skill's `files`** to safe under-folder paths with `SKILL.md` always present, and **sanitizes `requires`** to safe, de-duplicated, non-self-referencing catalog ids under `MAX_ITEM_REQUIRES`), `INSTALLABLE_ITEM_TYPES` (**all five types**, skills included) + `isInstallableType`, `skillFolderPrefix` |
| `packageResolution.ts` | `resolvePackage(item, byId)` → the item's transitive `requires` closure, **dependencies before dependents, the root last**; reports `missing` / `cycle` / `too-large` as data (the catalog is untrusted, so resolution is total and bounded by `MAX_PACKAGE_ITEMS`). Plus `indexCatalog`, `isPackage`, `describePackageFailure`. Mirrors the marketplace repo's `scripts/lib/catalog.mjs` resolver, which enforces the same rules at the source |
| `packageInstall.ts` | `installPackage(root, reviewedBody, dependencies, target, source, ctx)` — writes every dependency (body fetched from the snapshotted source) then the root (its **reviewed** body), returning `{ outcome, installed, skipped, written }`. Every member, root included, is preflighted through `ctx.isInstalled` before anything is fetched or written. I/O is injected so the ordering contract is testable without a plugin |
| `installerTypes.ts` | `InstallOutcome` / `MarketplaceInstallDeps` / `MarketplaceInstallOptions` — the contract shared by `MarketplaceInstaller` (notes + agents) and `skillInstall`, so neither installer imports the other |
| `skillInstall.ts` | The multi-file skill write split out of `MarketplaceInstaller`: `installSkillItem`, `isSkillInstalledAt`, `isSkillInstalledAnywhere`, and the in-skill path guards |
| `skillInstallTargets.ts` | Skill install-target model: `SkillProviderTarget` (`claude`/`codex`/`cursor` — the three that own a skill root; OpenCode reads Claude/Codex, so it's not a separate target), `SkillInstallScope` (`project`/`user`), `skillRootFor(target)` → `.claude/skills` etc. (relative path resolved under vault or home by scope), and `hasUnsafePathSegment` (shared traversal guard). Allowlisted in `noHardcodedProviderList` — a sanctioned enumeration (roots can't come from the registry, features→providers boundary) |
| `MarketplaceCatalogClient.ts` | HTTP fetch over Obsidian `requestUrl`; `fetchIndex()` + `fetchItemBody(path)`. Injectable `request`/`vet` seams (default: `requestUrl` + `assertSafeRemoteUrl`) |
| `MarketplaceCache.ts` | Schema-versioned JSON cache at `.specorator/cache/marketplace-index.json`; cold-safe `read()`/`write()` via `writeAtomic` |
| `MarketplaceInstaller.ts` | `installMarketplaceItem(item, body, deps, now, options?)` routes notes/agents to the same vault stores the app uses (`options.boundSkills` grants an agent its package skills); `isItemInstalled` drives the badge (skills: installed in **any** root, via `skillInstall`). The multi-file skill write itself lives in `skillInstall.ts`; `deps` carries a `homeAdapter` for user-scope writes |
| `MarketplaceView.ts` / `activateMarketplace.ts` / `viewType.ts` | `ItemView` host (per-leaf Vue app), leaf activation (optional `requestedView` deep-link), view-type constant |
| `marketplaceNetworkGate.ts` | One-time in-app Notice on first opt-in |
| `vue/MarketplaceRoot.vue` | Storefront orchestrator: opt-in gate, `activeView`/`detailId` state, per-type counts, `LibraryToolbar` + `useLibraryList` (scoped to the active view), generation-guarded body-fetch cache, install, offline/error banners. Routes the body between skeleton grid → Home sections / category grid → detail |
| `vue/components/MarketplaceNav.vue` | Primary category nav (Home + one button per present type, with counts). A `role="navigation"` landmark with `aria-current="page"` on the active category (matching `LibraryRoot`) — deliberately NOT an ARIA `tablist`/`role="tab"`, which promises arrow-key roving focus this doesn't implement. Single-select, emits `select` |
| `vue/components/MarketplaceHome.vue` | Storefront landing: one section per present type (header + count + first `previewLimit` cards + "See all →"); emits `open`/`seeAll` |
| `vue/components/MarketplaceGrid.vue` | Responsive card grid for a category/search scope; renders skeleton cells while `loading` with no items yet; empty state otherwise |
| `vue/components/MarketplaceCard.vue` | Per-item **vertical** grid card (type icon + badge + name + clamped description + tags + Installed badge). The whole card emits `open` to route to the detail — no inline preview/install |
| `vue/components/MarketplaceInstallAction.vue` | The detail header's install control (chip / not-installable note / button), extracted so the detail template keeps one concern per block. Renders only an informational chip when the install is driven by the target panel below |
| `vue/components/MarketplacePackageList.vue` | "Included with this install": the resolved dependencies with type badge, name, and installed marker — or, when the package can't resolve, the reason instead of a list |
| `vue/useDependencyInstalledSet.ts` | Resolves which dependencies are present **at the selected target** (async, sequence-guarded), so the package list can't claim a skill is installed when it only exists under a different provider |
| `vue/components/MarketplaceDetail.vue` | In-island detail/preview: Back, header (icon/name/badge/tags), gated Install, attribution (http(s)-only source link), raw `<pre>` body. Emits `back`/`install` (skills pass a `{provider, scope}` target). **Whenever a skill root is needed** (a skill, or a package bringing skills) it renders the provider + scope selector panel and reflects the CURRENTLY selected target's installed state (button → "Installed here", disabled) via the injected `skillInstalledChecker`, rechecking when the target changes or an install finishes. On mount moves focus to the name heading (`tabindex=-1`) and resets the scroll container to the top — view-change a11y so keyboard/SR focus enters the new view and the header isn't opened mid-scroll |
| `vue/marketplaceView.ts` | The `MarketplaceView` union (`'home' \| MarketplaceItemType`) shared by Nav + Root |
| `vue/marketplaceIcons.ts` | Per-type default Lucide icon map (`iconForItem`); re-exports the shared cross-window-safe `mountLucide` function-ref helper (`src/shared/vue/mountLucide.ts`, shared with the Agent Board) |
| `vue/marketplaceTypeLabels.ts` | Localized `type → label` map shared by the card/detail badge, the nav tabs, and the Home section headers |
| `vue/useMarketplaceInstalledRefresh.ts` | Per-leaf composable: debounced `store.refreshInstalled()` on four channels — `roster:changed` (agents), folder-scoped vault create/delete/rename (loops/templates/quick-actions), `settings-changed` (an install-folder setting change), and `vaultSkill.changed` (project skills — their dot-folder roots emit no vault events, so the bus is the only in-app signal) |
| `vue/stores/marketplaceStore.ts` | Shared Pinia store over one Pinia per plugin (all leaves share fetched catalog + installed state). `install(item, body, target?)` routes skills through `installSkillAt` — fetches the skill's supporting `files` (bounded concurrency, network-gated) then `installSkillItem`; `isSkillInstalledAt(item, provider, scope)` backs the detail's per-target check |

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
  re-fetch the body it writes (no TOCTOU, no re-dial), and the Install button stays
  disabled until that body has loaded. Loops/templates/quick-actions are written
  **verbatim** (provenance frontmatter preserved); agents parse into a `RosterAgent`.
  (Multi-file skills re-fetch `SKILL.md` only to *verify* it hasn't drifted before
  writing the reviewed body — see the skills contract below — never to change what's
  written.)
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
- **Installed badges live-sync across four channels.** A mutation OUTSIDE the
  marketplace (a Library delete/rename, a roster change, an install-folder setting
  change, a Library skill save/delete) recomputes `installedIds` without a manual
  Refresh, via `useMarketplaceInstalledRefresh`. Installed-state spans four
  signals: agents fire `roster:changed` on the event bus; loop/template/quick-action
  notes surface as Obsidian vault create/delete/rename events under their folders
  (existence-only — `modify` is irrelevant); a `settings-changed` event covers a
  change to the configured install FOLDERS (which moves where an item lives — and
  so which items count as installed — with no accompanying vault event); and
  **project skills** fire `vaultSkill.changed` on the event bus. Skills MUST use
  the bus, not vault events: their roots (`.claude/skills`, `.codex/skills`,
  `.cursor/skills`) are dot-folders Obsidian excludes from its vault index, so no
  create/delete/rename fires for a `SKILL.md` (the Library skill store + provider
  catalogs emit `vaultSkill.changed` on save/delete — the same signal
  `VaultSkillAggregator` invalidates on). User-scope skills live outside the vault
  (no watcher) and stay TTL/reopen-refreshed. All feed a debounced
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
- **Preview/detail cache is generation-guarded.** The reviewed body is fetched
  once when the detail opens (`openItem`), keyed by item id. A catalog reload
  bumps `catalogGeneration`, clears the `bodies`/`previewErrors` caches, AND
  closes the open detail (`detailId = null`) — an in-flight fetch that resolves
  after the reload is discarded via the generation guard so a stale body can't
  repopulate a reused id or linger in a detail for different content. Install is
  reachable ONLY from the detail and stays disabled until that body has loaded
  (`MarketplaceDetail`), preserving the "review exactly what installs" contract.
- **Category navigation is a single-select storefront tab bar, not a chip facet.**
  `activeView` (`'home' | MarketplaceItemType`) is the OUTER scope for the
  `useLibraryList` source getter, so the shared search/sort/tag facet operates on
  the active-view subset. `MarketplaceNav` shows Home plus one tab per type
  **present** in the catalog (never a dead tab). The body routes: `detailId` →
  `MarketplaceDetail`; else first-load skeleton grid; else Home (only when
  `activeView==='home'` AND no query AND no tag filters — any of those drops into
  a flat results grid); else the category/search grid. A query or tag on Home
  therefore switches to results (the storefront "search from anywhere" behavior).
  If the active category leaves a reloaded catalog (its count → 0), `activeView`
  falls back to `'home'` so the grid can't strand on an absent type (mirrors
  `useLibraryList`'s tag-prune). The type facet is deliberately NOT threaded
  through the shared `LibraryToolbar` — the four Library panels are each already
  one-type-per-tab and would inherit a dimension they can't use.
- **Chrome-first, skeleton loading.** `MarketplaceNav` + `LibraryToolbar` render
  as soon as the opt-in is on (they depend only on `store.items` for counts/tags,
  which start empty and fill in reactively), so the network fetch never blanks the
  surface; `MarketplaceGrid` shows a skeleton grid while `store.loading` with no
  items yet. The fetch is async (`requestUrl`) and `refreshInstalled`'s per-item
  vault checks run after load — both off the first-paint path.
- **Deep-linkable from the Library, scoped per leaf.** `activateMarketplace(plugin,
  requestedView?)` reveals the target leaf, loads it, THEN calls `requestView` on
  THAT leaf's `MarketplaceView` (duck-typed, no class import) — which sets a
  per-leaf ref (`REQUESTED_VIEW_KEY`, owned + provided by the view) that the leaf's
  `MarketplaceRoot` watches and consumes (resets to null). Per-leaf, NOT a
  shared-store broadcast every mounted Root races to consume — that is what stops a
  second live Marketplace leaf from swallowing another leaf's request (e.g. the
  revealed leaf still deferred while another is live). The Library's per-tab
  "Browse Marketplace" link (`LibraryRoot`, `TAB_TO_MARKETPLACE`) routes through it
  — Agents→agents, Loops→loops, Quick Actions→quick-action, Skills→skill. A
  stranded category (0 items) falls back to Home via the counts+activeView guard.
  `LibraryRoot` importing `activateMarketplace` is a one-way features→features edge
  (activateMarketplace pulls in no Library module), so no cycle.
- **Skills install as a multi-file folder, with a provider + scope chooser.** A
  skill's manifest entry carries a `files[]` (every file in the skill folder,
  `SKILL.md` included). The `SKILL.md` shown in the preview installs verbatim
  (the "review exactly what installs" contract); the **supporting files are
  fetched at install time** from the same source (network-gated + SSRF/base-URL
  constrained, one bounded-concurrency batch, all-or-nothing so no partial skill
  is written). For a multi-file skill the reviewed `SKILL.md` is **re-fetched after
  that batch and must still equal the reviewed body** — a mismatch aborts the
  install with a "catalog changed — re-review" error, so a mid-window catalog bump
  can't pair the reviewed marker with newer supporting files (the reviewed body is
  still what's written; the re-fetch is a consistency guard). It narrows but doesn't
  close the window — a bump that rewrites a supporting file while leaving `SKILL.md`
  byte-identical still passes; full immutable-revision / content-hash pinning is a
  documented cross-repo residual (`docs/tech-debt/2026-07-20-marketplace-skill-install-hardening.md`).
  A marker-only skill has no supporting files, so it skips the re-fetch. The user
  picks a **provider** — Claude, Codex, or Cursor (the
  three that own a skill root; OpenCode reads Claude's/Codex's and isn't a
  separate target) — and a **scope**: `project` (the vault's `.claude/skills`,
  `.codex/skills`, or `.cursor/skills`, written via the vault adapter) or `user`
  (the same relative path under the home dir, written via `HomeFileAdapter`,
  outside the vault). A **user-scope** target is re-checked against live settings at
  write time (`ProviderRegistry.installsUserScopeSkills`, the write-time parallel of the
  network re-check): a target captured while supported aborts rather than writes if the
  provider lost the capability mid-install (Codex→WSL, Claude `loadUserSettings` off), so
  it can't silently land in a host home the runtime no longer scans. The whole folder
  lands under `<root>/<skill-name>/`, `SKILL.md` written **last** so a mid-write failure
  leaves no dedup marker.
  Every skill file path is guarded twice — `parseManifest` sanitizes `files` to
  stay under the skill folder, and the installer re-checks each in-skill path
  (`hasUnsafePathSegment`) before writing. The reviewed `SKILL.md` is also
  validated before it's written as the completion marker
  (`assertInstallableSkillBody`: needs `name`+`description` frontmatter, the `name`
  must pass the strict provider slug rule `validateSlugName` — exact `[a-z0-9-]`,
  ≤64 chars, no YAML-reserved word — AND slugify to the install slug; the strict
  check catches names the lossy slug match would mask, like `Foo_Bar` or `"null"`,
  that no provider could load). Skills are **text-only** — the plugin fetches each
  file as `requestUrl().text` and writes UTF-8, so a binary would corrupt; the
  store refuses a skill whose `files[]` carries a binary extension
  (`isBinarySkillPath`) before fetching, and the marketplace repo's validator
  enforces the same rule by content at the source. The card/grid badge means
  "installed in **any** root"; the detail button reflects the **selected** target.

- **A package installs whole, dependencies first.** An item may declare
  `requires` — catalog ids installed **with** it (the Project Manager agent and
  the twelve project-artifact skills it works through). `store.install`
  resolves the transitive closure against the LOADED catalog and writes
  dependencies before the root, so an agent is never installed bound to skills
  that aren't there. A resolution failure (a dependency absent from this
  catalog, a cycle, over `MAX_PACKAGE_ITEMS`) installs **nothing** and is
  surfaced in the detail up front, not on click. A dependency failure mid-install
  throws BEFORE the root is written; dependencies already written are
  deliberately NOT rolled back (each is a valid, independently useful vault item
  owned by its own store, and a retry re-runs the package and skips what landed).
  Everything already present is skipped, never overwritten — and skipped
  **before** its body is fetched (`ctx.isInstalled`), so a transient catalog
  failure can't abort a package whose members are all satisfied, and the skill
  installer's own "already here, don't download" preflight isn't defeated by a
  request spent ahead of it. The **root** gets that same preflight, using the
  same predicate the Installed badge uses: completing a partly-installed package
  re-runs the root, and the installers dedup on a NARROWER key than the badge
  (an agent on its name-slug roster id, the badge also on the source-scoped
  catalog id), so without it a catalog-side rename would write a second agent.
  (Cross-rename idempotency stays deferred update-management — the storage key
  is untouched; the preflight only stops the package flow from reaching it,
  since before packages an installed root was never offered for install.)
  The whole package is
  fetched from ONE snapshotted source, so a concurrent leaf's refresh can't pair
  an agent from one catalog with skills from another; the install deps are
  PINNED to that source too, so an agent whose body came from catalog A can't be
  stamped with B's URL mid-package. A user-scope target is re-checked once more
  before the root is committed (`assertTargetInstallable`): a pre-installed skill
  dependency returns `'skipped'` before the skill installer's own check, so
  without it the same package + settings + target would behave differently
  depending on whether the skills happened to already exist. `install` returns
  `{ outcome, installed, skipped }` — `outcome` is the root's own result (what
  the badge keys on), the counts are its dependencies (what the notice reports).
  **A skill dependency binds to its agent**: `boundSkillNames` maps the package's
  skill items to their install slugs and `installAgent` writes them to
  `RosterAgent.skills`, so a Marketplace agent reaches its skills with no manual
  granting. An agent that already exists is skipped, so re-granting skills onto a
  user-owned agent is deferred update-management, not part of install.
  Only the ROOT item's body is the reviewed one; a dependency is **listed** in
  the detail (name + type + installed state) but not individually previewed, and
  its body is fetched at install time — the review contract is per-item, and a
  package's members are named up front so the user knows what one click writes.
- **A package that brings skills needs a skill root.** `MarketplaceDetail` shows
  the provider + scope panel when the item is a skill **or** its dependencies
  include one, and that panel's button becomes the package install ("Install all
  (N)"). Completeness is judged **against the selected target**, never
  "installed anywhere": one `memberInstalledAt` answers both the button's
  whole-package check and the dependency list's per-item markers, so the list can
  never contradict the control beside it, and a package installed into Claude can
  still be installed into Codex or Cursor. Skills resolve against the chosen
  provider + scope; non-skill members keep catalog-wide state, since a loop or
  template has a single vault home and no target to scope to. A partially
  installed package still offers to complete itself.

## Tests

`tests/unit/features/marketplace/` (catalog types incl. skill-`files` and
`requires` sanitization, client, cache, installer incl. `installSkillItem`/target
routing and agent skill binding, `packageResolution`, `packageInstall`,
`skillInstallTargets`) and `tests/vue/marketplace/` (root, store incl. skill and
package install, and the storefront components: nav, home, grid, card, detail
incl. the skill provider/scope panel and the target-scoped dependency list, plus
the installed-refresh and `useDependencyInstalledSet` composables). The
settings-tab rendering regression lives in
`tests/integration/settings/marketplaceTab.test.ts`.
