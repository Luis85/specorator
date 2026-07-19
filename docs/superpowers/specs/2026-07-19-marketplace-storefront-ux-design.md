---
title: Marketplace storefront UX — category navigation, card grid, in-island detail, non-blocking fetch
date: 2026-07-19
status: accepted
scope: src/features/marketplace/vue, src/i18n, src/features/marketplace/CLAUDE.md, tests/vue/marketplace
relates-to: docs/adr/0007-remote-marketplace-replaces-bundled-presets.md, docs/product/Specorator Marketplace PRD.md
method: brainstorming (owner-approved design, 2026-07-19)
---

# Marketplace storefront UX design

## Context

The Marketplace shipped (PR #494, ADR 0007) as a Vue 3 + Pinia island that
reuses the Library's list/toolbar/card components. Today, once the opt-in
network gate is cleared, the view renders every catalog item (27 items across
4 types — quick-action ×3, agent ×8, loop ×9, template ×7) as a **flat vertical
list of full-width rows** behind a secondary type-filter **chip** row and a
search/sort/tag toolbar. Install is gated behind an **inline `<pre>` preview**
that expands under the clicked row.

Two problems, per the owner:

1. **The fetch reads as UI-blocking.** The catalog fetch is already async
   (Obsidian `requestUrl`), but on the first enabled mount the surface is empty
   except a one-line "Loading catalog…" banner until the fetch resolves, then
   dumps the whole list at once. There is no chrome-first render and no skeleton,
   so it *feels* frozen.
2. **It looks like an ugly table, everything upfront.** A flat row list with a
   chip filter is not a storefront. There is no primary category navigation and
   no visual hierarchy — opening the Marketplace shows all 27 rows at once.

This design reshapes the **presentation** into a storefront. It does **not**
change the store, client, cache, installer, or the security model — those are
covered by ADR 0007 and their existing tests, all of which stay green.

## Goals

- **G1** — A **primary category navigation** (persistent top tabs) is the main
  way to browse: Home · Quick Actions · Agents · Loops · Templates, each with a
  live count.
- **G2** — A **storefront Home landing** that groups the catalog into per-type
  sections (icon header + count + first few cards + "See all →") instead of a
  flat table.
- **G3** — A **responsive card grid** (vertical cards) for a selected category
  or a search result, replacing the full-width row list.
- **G4** — An **in-island detail view** (product-detail-page style) for reviewing
  an item before install, replacing the inline `<pre>` expand.
- **G5** — **Chrome-first + skeleton loading**: the nav + toolbar render
  instantly and a skeleton grid stands in while the fetch is in flight, so the
  surface never blanks and the category nav is interactive during load.

## Non-goals (YAGNI)

- **NG1** — No "Featured" / "Staff picks" / "Popular" curation. That needs a
  catalog-schema signal the manifest does not carry today.
- **NG2** — No markdown-*rendered* item body. The raw `<pre>` body is the
  security review surface (a rendered view could hide injected instructions or
  load remote images); the detail view keeps the raw body.
- **NG3** — No skills install path (`INSTALLABLE_ITEM_TYPES` still excludes
  `skill`; a skill still shows a "not yet installable" note).
- **NG4** — No store/client/cache/installer changes. No new perf test (27 items;
  the grid is trivial and needs no windowing).
- **NG5** — No web-worker / chunked parsing. The manifest is small and parsing
  is off the paint path already; skeletons cover the perceived-latency gap.

## Architecture

### Component decomposition

`MarketplaceRoot.vue` is 382 lines and already owns gate + facet + toolbar +
list + preview + install + banners. The storefront adds nav + home + grid +
detail + skeleton, so the file is split into focused, independently testable
units. The **store contract is unchanged**; this is a view-layer reshape.

```
src/features/marketplace/vue/
  MarketplaceRoot.vue            orchestrator (see below)
  components/
    MarketplaceNav.vue           category tab bar + counts (primary nav)
    MarketplaceHome.vue          storefront landing: per-type sections
    MarketplaceGrid.vue          responsive card grid + skeleton + empty state
    MarketplaceCard.vue          reworked row→vertical card (opens detail)
    MarketplaceDetail.vue        in-island detail: body, attribution, gated Install
  marketplaceIcons.ts            type → default lucide icon name map
  (existing: marketplaceAccessors.ts, marketplaceTypeLabels.ts, marketplaceKeys.ts,
   stores/marketplaceStore.ts, useMarketplaceInstalledRefresh.ts, globalPinia.ts)
```

**`MarketplaceRoot.vue`** keeps every side-effecting concern that must live once
per leaf and stays the single owner of async/security state:
- opt-in gate (`enabled`), `store.init`, first-mount auto-load, network warning,
  `settings-changed` re-sync, `useMarketplaceInstalledRefresh` subscription;
- **view state**: `activeView: 'home' | MarketplaceItemType` and
  `detailId: string | null`;
- the **generation-guarded body-fetch cache** (`bodies` / `previewErrors`) and
  the `catalogGeneration` reset watch — moved verbatim from today's
  `togglePreview`, now triggered by `openItem` (opening the detail) instead of an
  inline expand;
- `install(item)` (unchanged semantics — installs the reviewed `bodies[id]`);
- `useLibraryList` over a source scoped by `activeView`;
- renders `MarketplaceNav` + `LibraryToolbar` + banners, then the body router,
  then the source line.

### View / body routing (in `MarketplaceRoot`)

Given `activeView`, `detailId`, `list` (from `useLibraryList`), and `store`:

1. `detailId` set → **`MarketplaceDetail`** (over the item found by id; if the id
   left a reloaded catalog, `detailId` is cleared by the same generation watch).
2. else `store.loading && store.items.length === 0` → **`MarketplaceGrid`** in
   skeleton mode (fixed placeholder count, e.g. 6).
3. else `activeView === 'home' && list.query === '' && list.activeFilters == []`
   → **`MarketplaceHome`** (sections from raw `store.items` grouped by type).
4. else → **`MarketplaceGrid`** over `list.rows` (search/sort/tags applied to the
   `activeView`-scoped source).

`useLibraryList` source getter:
`() => activeView === 'home' ? store.items : store.items.filter(i => i.type === activeView)`.
So search/sort/tag facets always operate on the active scope, and typing a query
on Home (or activating a tag chip) drops out of the sectioned landing into a flat
results grid — the storefront-standard "search from anywhere → results" behavior.

### `MarketplaceNav.vue`

- Props: `activeView: 'home' | MarketplaceItemType`,
  `counts: Record<MarketplaceItemType, number>` (derived in Root from
  `store.items`), `typeLabels`.
- Emits: `select(view)`.
- Renders a `role="tablist"` of buttons: Home, then one tab per type **that is
  present in the catalog** (hidden when a type has zero items — mirrors today's
  facet behavior), each showing its count. `aria-selected` on the active tab.
- Purely presentational; no store access.

### `MarketplaceHome.vue`

- Props: `sections: Array<{ type, items }>` (only non-empty types, canonical
  order), `installedIds: ReadonlySet<string>`, `typeLabels`, `previewLimit`
  (default 4).
- Emits: `open(item)`, `seeAll(type)`.
- Renders a short hero line, then one section per type: an icon + label header
  with the count and a "See all →" control (emits `seeAll(type)` → Root sets
  `activeView = type`), and the first `previewLimit` items as `MarketplaceCard`s
  in a grid. Uses `MarketplaceGrid` internally OR renders `MarketplaceCard`
  directly in a section grid (implementation detail — no skeleton/empty state
  needed inside a section).

### `MarketplaceGrid.vue`

- Props: `items: MarketplaceItem[]`, `installedIds: ReadonlySet<string>`,
  `typeLabels`, `loading?: boolean`, `skeletonCount?: number` (default 6).
- Emits: `open(item)`.
- Renders a responsive CSS grid (`repeat(auto-fill, minmax(<card>, 1fr))`) of
  `MarketplaceCard`. When `loading && items.length === 0`, renders
  `skeletonCount` skeleton cells (inert, `aria-hidden`, a shimmer placeholder —
  no separate component; skeleton markup lives here). When not loading and
  `items` is empty, renders the empty-state text (`marketplace.empty`).

### `MarketplaceCard.vue` (reworked)

- Props: `item: MarketplaceItem`, `installed: boolean`, `typeLabel: string`.
- Emits: `open`.
- A **vertical** card (no longer a `LibraryCard` row): a type **icon** (from
  `item.icon` if a non-empty string, else the per-type default in
  `marketplaceIcons.ts`, rendered via Obsidian `setIcon` on a ref), a small type
  **badge**, the **name**, a 2-line-clamped **description**, up to a few **tags**,
  and a footer that shows the **Installed** badge when installed (otherwise the
  whole card is the "open detail" affordance). `role="button"`, `tabindex="0"`,
  `aria-label = item.name`, Enter/Space + click → `emit('open')`. **No inline
  preview or Install** — those move to the detail view.

### `MarketplaceDetail.vue`

- Props: `item`, `body: string | null`, `previewError: boolean`,
  `installing: boolean`, `installed: boolean`, `typeLabel`, `installable`
  (`isInstallableType(item.type)`).
- Emits: `back`, `install`.
- Layout: a **Back** control (emits `back` → Root clears `detailId`); a header
  with the type icon, name, badge, and tags; the **attribution** row (author /
  license / source — source linkified **only** when it is `http(s)`, the
  `safeSourceUrl` logic moved here from the card); the **Install** area:
  - installed → the "Installed" indicator;
  - not `installable` → the "Not yet installable" note;
  - else → an Install button, **disabled** until `body !== null` (and while
    `installing`), emitting `install`;
- and the raw **`<pre>` body** (`previewError ? loadError : body ?? loading`),
  scrollable, `user-select: text`. This IS the mandatory preview surface (F-SEC-2).

## Data flow

```
store.items ──► Root: counts (per type)              ──► MarketplaceNav
            └─► Root: useLibraryList(scoped source)   ──► rows ──► MarketplaceGrid
            └─► Root: sections (grouped by type)      ──► MarketplaceHome
Card @open(item) ─► Root: detailId = item.id; fetch body (generation-guarded)
Root: bodies[id] / previewErrors[id] ─► MarketplaceDetail
Detail @install ─► Root.install(item) ─► store.install(item, bodies[id])
Detail @back / Nav @select / Home @seeAll ─► Root: detailId/activeView updates
```

The **catalog-reload watch** (`watch(() => store.items, …)`) bumps
`catalogGeneration`, clears `bodies`/`previewErrors`, **and now also clears
`detailId`** (a detail open against a stale id must close on reload), preserving
the existing "no stale body survives a source switch" invariant.

## Non-blocking fetch

- `MarketplaceNav` + `LibraryToolbar` render as soon as `enabled` is true — they
  depend only on `store.items` for counts/tags, which start empty and fill in
  reactively; they never await the network.
- The first paint shows the shell + a **skeleton grid** (routing rule 2), not a
  bare banner. The one-line loading banner is removed in favor of the skeleton;
  offline/error banners stay (small, above the body).
- Per-type counts derive from `store.items` (cheap, memoized via `computed`).
- `store.refreshInstalled` (per-item async vault checks) already runs after load
  in the store's `finally` — off the first-paint path; unchanged.

## Security invariants (preserved, unchanged behavior)

- **Install only from the detail/preview** (F-SEC-2): the card has no Install;
  Install lives solely in `MarketplaceDetail`, reachable only by opening an item.
- **Install disabled until the reviewed body loads**, and installs that exact
  body (`store.install(item, bodies[id])`, no re-fetch) — same as today.
- **Generation-guarded body cache**: unchanged; a body that resolves after a
  catalog reload is discarded; `detailId` also clears on reload.
- **Untrusted source string**: linkified only for `http(s)` (`safeSourceUrl`),
  now in the detail component; a `javascript:`/`file:` source stays inert text.
- **id-keyed caches** stay safe via `CATALOG_ID_PATTERN` (catalogTypes.ts,
  unchanged).

## Error handling

- Fetch failure with a matching cache → offline banner + cached grid (store,
  unchanged).
- Fetch failure with no cache → error banner + empty state; nav still renders
  (counts all zero, tabs hidden), Home shows the empty hero.
- Body fetch failure → the detail body shows `loadError`; Install stays disabled
  (body is null). Back returns to the grid.

## Testing

Vitest Vue lane (`tests/vue/marketplace/`):

- **`marketplaceRoot.test.ts`** (updated): gate + settings-changed + reuse-mount
  refresh (unchanged); **nav tabs** replace the type-facet chip assertions
  (clicking a category tab scopes the grid; Home shows sections); **detail**
  replaces the inline-preview assertions (click a card → detail renders → Install
  hands the reviewed body to `store.install`; Install disabled until body loads);
  preview-invalidation on catalog reload now asserts the **detail** closes/re-
  fetches; live-sync subscription assertions unchanged.
- **`marketplaceNav.test.ts`** (new): tabs render only for present types with
  correct counts; active `aria-selected`; `select` emitted; Home always present.
- **`marketplaceHome.test.ts`** (new): one section per non-empty type with count
  + capped card list; `seeAll(type)` and `open(item)` emitted.
- **`marketplaceGrid.test.ts`** (new): a card per item; skeleton cells when
  `loading && empty`; empty state otherwise; `open(item)` emitted.
- **`marketplaceDetail.test.ts`** (new): Back emits; Install gated until body;
  installed → indicator not button; not-installable note; **source-link safety**
  (moved from `marketplaceCard.test.ts`: http(s) linkified, `javascript:`/`file:`
  inert).
- **`marketplaceCard.test.ts`** (reworked): vertical card renders name/desc/
  badge/tags; installed badge; `open` emitted on click/Enter.
- Store / installer / cache / network-gate tests: **untouched**.
- Style baseline (`tests/vue/styleBaseline.test.ts`): new components use only
  `.specorator-vue-*` classes + `is-*` modifiers + `--sp-*` tokens.

## Styling

- All components style through the `.specorator-vue` baseline + `--sp-*` tokens
  (scoped SFC `<style>`, merged after `VUE_STYLES_MARKER`). No new Obsidian var
  is introduced without a `--sp-*` mapping in `vue/tokens.css`.
- Grid: `display: grid; grid-template-columns: repeat(auto-fill, minmax(<card>, 1fr))`
  so it reflows from multi-column (wide main-area leaf) to one column (narrow
  sidebar leaf). Card min-width ≈ 14rem.
- Skeleton shimmer: a scoped `@keyframes` on a token-colored placeholder block.
- `marketplace-host.css` (host chrome) unchanged.

## i18n

English is the resolution fallback (`i18n.ts`), so new keys are authored in
`en.json`. Added under `marketplace.*`: `nav.home`, `home.heading`,
`home.subheading`, `seeAll`, `sectionCount` (`{count} items`), `detail.back`,
`skeletonLabel`, `navGroupLabel`. Removed (now unused): `allTypes`,
`typeFilterGroupLabel` (replaced by the nav). `preview` is retained only if a
label is still needed; the card no longer shows a "Preview" button. If a
locale-parity test exists, the same keys are mirrored to the other 9 locales
with the English string.

## Build / quality gates

- **LOC ratchet** (`check:loc`): the split keeps every new `.vue`/`.ts` file
  under the ceiling; `MarketplaceRoot.vue` shrinks. If `MarketplaceRoot.vue` had
  a `loc-baseline.json` entry that becomes stale, remove it in the same PR.
- **Quality ratchet** (`check:quality` vs `scripts/quality-baseline.json`):
  re-lock improved/changed metrics in the same PR per
  `docs/build-ci/clean-code-refactoring.md`.
- Standard gate before commit: `npm run typecheck && npm run typecheck:vue &&
  npm run lint && npm run test && npm run test:vue && npm run build`.

## Docs

- `src/features/marketplace/CLAUDE.md`: update the Layout table (new components)
  and add a short "storefront: nav tabs → home sections / grid → detail" note;
  the security invariants section is unchanged in substance (Install-from-detail,
  gated body, generation guard) but re-pointed at the detail component.
- Root `CLAUDE.md` marketplace row: light touch ("storefront category nav + card
  grid + in-island detail" over the reused Library list/toolbar).
```
