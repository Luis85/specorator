# Marketplace Storefront UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reshape the Marketplace Vue island into a storefront — primary category tab nav, a sectioned Home landing, a responsive card grid, an in-island detail/preview view, and chrome-first skeleton loading — without touching the store, client, cache, installer, or security model.

**Architecture:** Presentation-only refactor of `src/features/marketplace/vue/`. `MarketplaceRoot.vue` becomes a thin orchestrator that owns view state (`activeView`/`detailId`), the generation-guarded body-fetch cache, and install; it delegates to five focused child components (`MarketplaceNav`, `MarketplaceHome`, `MarketplaceGrid`, `MarketplaceCard`, `MarketplaceDetail`). The store contract is unchanged, so every store/installer/cache/gate test stays green.

**Tech Stack:** Vue 3 `<script setup>` + Pinia, `@testing-library/vue` + Vitest (`npm run test:vue`), Obsidian `setIcon` for Lucide glyphs, the shared `useLibraryList` + `LibraryToolbar`, `--sp-*` design tokens.

**Reference spec:** `docs/superpowers/specs/2026-07-19-marketplace-storefront-ux-design.md`

---

## File structure

Create:
- `src/features/marketplace/vue/marketplaceView.ts` — the `MarketplaceView` union type.
- `src/features/marketplace/vue/marketplaceIcons.ts` — per-type default Lucide names + `mountIcon` function-ref helper.
- `src/features/marketplace/vue/components/MarketplaceNav.vue` — category tab bar.
- `src/features/marketplace/vue/components/MarketplaceHome.vue` — sectioned landing.
- `src/features/marketplace/vue/components/MarketplaceGrid.vue` — grid + skeleton + empty.
- `src/features/marketplace/vue/components/MarketplaceDetail.vue` — in-island detail/preview.
- `tests/vue/marketplace/marketplaceNav.test.ts`, `marketplaceHome.test.ts`, `marketplaceGrid.test.ts`, `marketplaceDetail.test.ts`.

Modify:
- `src/features/marketplace/vue/components/MarketplaceCard.vue` — row→vertical card, opens detail.
- `src/features/marketplace/vue/MarketplaceRoot.vue` — orchestrator rewrite.
- `tests/vue/marketplace/marketplaceRoot.test.ts` — tabs replace chips; detail replaces inline preview.
- `tests/vue/marketplace/marketplaceCard.test.ts` — reworked card; source-safety moves out.
- `src/i18n/locales/*.json` (all 10) — add storefront keys, remove `allTypes`/`typeFilterGroupLabel`/`preview`.
- `src/features/marketplace/CLAUDE.md`, root `CLAUDE.md` — doc the storefront.

Unchanged (and their tests stay green): `stores/marketplaceStore.ts`, `MarketplaceCatalogClient.ts`, `MarketplaceCache.ts`, `MarketplaceInstaller.ts`, `catalogTypes.ts`, `useMarketplaceInstalledRefresh.ts`, `marketplaceAccessors.ts`, `marketplaceTypeLabels.ts`, `MarketplaceView.ts` (host).

---

## Task 1: Shared types, icons, and i18n keys

**Files:**
- Create: `src/features/marketplace/vue/marketplaceView.ts`
- Create: `src/features/marketplace/vue/marketplaceIcons.ts`
- Modify: `src/i18n/locales/*.json` (all 10)

- [ ] **Step 1: Add the view union type**

`marketplaceView.ts`:
```ts
import type { MarketplaceItemType } from '../catalogTypes';

/** The active storefront view: the Home landing or a single category. */
export type MarketplaceView = 'home' | MarketplaceItemType;
```

- [ ] **Step 2: Add the icon map + function-ref helper**

`marketplaceIcons.ts`:
```ts
import { setIcon } from 'obsidian';
import type { ComponentPublicInstance } from 'vue';

import type { MarketplaceItemType } from '../catalogTypes';

/** Per-type default Lucide glyph, used when a catalog item carries no `icon`. */
const DEFAULT_TYPE_ICONS: Record<MarketplaceItemType, string> = {
  'quick-action': 'zap',
  agent: 'bot',
  loop: 'repeat',
  template: 'file-text',
  skill: 'sparkles',
};

/**
 * The Lucide icon name to render for an item: its own `icon` when a non-empty
 * string, else the per-type default. The catalog is untrusted, but `setIcon`
 * only looks a name up in a fixed icon set (an unknown name renders nothing) —
 * it never injects the string as markup, so passing `item.icon` through is safe.
 */
export function iconForItem(item: { type: MarketplaceItemType; icon?: string }): string {
  const own = item.icon?.trim();
  return own && own.length > 0 ? own : DEFAULT_TYPE_ICONS[item.type];
}

/**
 * Function-ref host for a Lucide glyph (mirrors the board's `mountLucide`):
 * records the intent as `data-icon` (the test-lane `setIcon` is a no-op, so this
 * is what component tests assert) and renders the real SVG via `setIcon`.
 * Cross-window-safe: `nodeType === 1` instead of `instanceof HTMLElement`, which
 * is bound to the main window and fails inside an Obsidian popout.
 */
export function mountIcon(el: Element | ComponentPublicInstance | null, icon: string): void {
  if (el == null || (el as Partial<Node>).nodeType !== 1) return;
  const host = el as HTMLElement;
  host.setAttribute('data-icon', icon);
  setIcon(host, icon);
}
```

- [ ] **Step 3: Rewrite the `marketplace` i18n block in `en.json`**

Add these keys (English source of truth) and REMOVE `allTypes`, `typeFilterGroupLabel`, `preview`. New keys:
```json
"nav": { "home": "Home" },
"navGroupLabel": "Marketplace categories",
"home": {
  "heading": "Discover ready-made assets",
  "subheading": "Browse curated Quick Actions, Agents, Loops, and Templates and install them into your vault."
},
"seeAll": "See all",
"sectionCount": "{count} items",
"detail": { "back": "Back" }
```

- [ ] **Step 4: Mirror the keys to the other 9 locales**

The marketplace block is English-seeded and identical across all locales, and `tests/unit/i18n/locales.test.ts` enforces exact key parity with English. Run a one-off script to copy `en.json`'s `marketplace` object into every other locale (preserving each file's other keys and 2-space formatting):
```bash
node -e '
const fs=require("fs");
const dir="src/i18n/locales";
const en=JSON.parse(fs.readFileSync(dir+"/en.json","utf8"));
for(const f of fs.readdirSync(dir)){
  if(f==="en.json"||!f.endsWith(".json"))continue;
  const p=dir+"/"+f; const d=JSON.parse(fs.readFileSync(p,"utf8"));
  d.marketplace=en.marketplace;
  fs.writeFileSync(p, JSON.stringify(d,null,2)+"\n");
}'
```
(If a file’s diff shows unrelated reflow, the file was not 2-space/newline-terminated — re-check that one by hand. Verify first with `tail -c1 src/i18n/locales/de.json | xxd` showing `0a`.)

- [ ] **Step 5: Verify locale parity + no dangling references**

Run: `npm run test -- --selectProjects unit -t "locale files"`
Expected: PASS.
Run: `grep -rn "marketplace.allTypes\|marketplace.typeFilterGroupLabel\|marketplace.preview\|'marketplace.preview'" src/ || echo clean`
Expected: `clean` (nothing references the removed keys — the current references live in `MarketplaceRoot.vue`/`MarketplaceCard.vue`, replaced in later tasks; if this grep finds them now that's expected until Tasks 5–6 land, so re-run it after Task 6).

- [ ] **Step 6: Commit**

```bash
git add src/features/marketplace/vue/marketplaceView.ts src/features/marketplace/vue/marketplaceIcons.ts src/i18n/locales
git commit -m "Marketplace: storefront view type, icon map, and i18n keys"
```

---

## Task 2: MarketplaceCard (row → vertical card)

**Files:**
- Modify: `src/features/marketplace/vue/components/MarketplaceCard.vue`
- Test: `tests/vue/marketplace/marketplaceCard.test.ts`

- [ ] **Step 1: Rewrite the card test** (`marketplaceCard.test.ts`)

```ts
import { fireEvent, render, screen } from '@testing-library/vue';
import { describe, expect, it } from 'vitest';

import type { MarketplaceItem } from '@/features/marketplace/catalogTypes';
import MarketplaceCard from '@/features/marketplace/vue/components/MarketplaceCard.vue';

const item: MarketplaceItem = {
  id: 'a', type: 'loop', name: 'Alpha', description: 'Alpha desc',
  path: 'loops/a.md', tags: ['t1', 't2'],
};

function renderCard(overrides: Partial<{ installed: boolean }> = {}) {
  return render(MarketplaceCard, {
    props: { item, installed: overrides.installed ?? false, typeLabel: 'Loop' },
  });
}

describe('MarketplaceCard', () => {
  it('renders name, description, type label, and tags', () => {
    renderCard();
    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(screen.getByText('Alpha desc')).toBeTruthy();
    expect(screen.getByText('Loop')).toBeTruthy();
    expect(screen.getByText('t1')).toBeTruthy();
  });

  it('emits open on click and on Enter', async () => {
    const { emitted } = renderCard();
    const card = screen.getByRole('button', { name: 'Alpha' });
    await fireEvent.click(card);
    await fireEvent.keyDown(card, { key: 'Enter' });
    expect(emitted().open).toHaveLength(2);
  });

  it('shows the Installed badge when installed', () => {
    renderCard({ installed: true });
    expect(screen.getByText('Installed')).toBeTruthy();
  });

  it('renders the type icon intent (data-icon) from the per-type default', () => {
    const { container } = renderCard();
    expect(container.querySelector('[data-icon="repeat"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:vue -- marketplaceCard`
Expected: FAIL (card still renders the old row markup / `Preview` button; no `data-icon`).

- [ ] **Step 3: Rewrite `MarketplaceCard.vue`**

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue';

import { t } from '../../../../i18n/i18n';
import type { MarketplaceItem } from '../../catalogTypes';
import { iconForItem, mountIcon } from '../marketplaceIcons';

const props = defineProps<{ item: MarketplaceItem; installed: boolean; typeLabel: string }>();
const emit = defineEmits<{ open: [] }>();

const cardEl = ref<HTMLElement | null>(null);
const iconEl = ref<HTMLElement | null>(null);
onMounted(() => {
  if (iconEl.value) mountIcon(iconEl.value, iconForItem(props.item));
});

// Releasing a text selection fires click on the card; selecting the (selectable)
// description must not open the detail. Click-path only — keyboard never carries
// a selection.
function onClick(): void {
  if (window.getSelection()?.toString()) return;
  emit('open');
}
function onKeydown(e: KeyboardEvent): void {
  if (e.target !== cardEl.value) return;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    emit('open');
  }
}
</script>

<template>
  <div
    ref="cardEl"
    class="specorator-vue-marketplace-card"
    role="button"
    tabindex="0"
    :aria-label="props.item.name"
    @click="onClick"
    @keydown="onKeydown"
  >
    <div class="specorator-vue-marketplace-card-top">
      <div
        ref="iconEl"
        class="specorator-vue-marketplace-card-icon"
      />
      <span class="specorator-vue-marketplace-card-badge">{{ props.typeLabel }}</span>
      <span
        v-if="props.installed"
        class="specorator-vue-marketplace-card-installed"
      >{{ t('marketplace.installed') }}</span>
    </div>
    <div class="specorator-vue-marketplace-card-name">
      {{ props.item.name }}
    </div>
    <p class="specorator-vue-marketplace-card-desc">
      {{ props.item.description }}
    </p>
    <div
      v-if="props.item.tags.length > 0"
      class="specorator-vue-marketplace-card-tags"
    >
      <span
        v-for="tag in props.item.tags"
        :key="tag"
        class="specorator-vue-chip"
      >{{ tag }}</span>
    </div>
  </div>
</template>

<style scoped>
.specorator-vue-marketplace-card {
  display: flex;
  flex-direction: column;
  gap: var(--sp-space-2xs);
  padding: var(--sp-space-m);
  border: 1px solid var(--sp-border);
  border-radius: var(--sp-radius-m);
  background: var(--sp-surface-raised);
  cursor: pointer;
  transition: border-color 120ms ease, background 120ms ease;
}
.specorator-vue-marketplace-card:hover {
  border-color: var(--sp-accent);
  background: var(--sp-surface-hover);
}
.specorator-vue-marketplace-card-top {
  display: flex;
  align-items: center;
  gap: var(--sp-space-xs);
}
.specorator-vue-marketplace-card-icon {
  display: inline-flex;
  color: var(--sp-text-muted);
}
.specorator-vue-marketplace-card-icon :deep(svg) {
  width: 18px;
  height: 18px;
}
.specorator-vue-marketplace-card-badge {
  font-size: var(--sp-font-smaller);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--sp-text-muted);
  border: 1px solid var(--sp-border);
  border-radius: var(--sp-radius-s);
  padding: var(--sp-space-3xs) var(--sp-space-xs);
}
.specorator-vue-marketplace-card-installed {
  margin-left: auto;
  font-size: var(--sp-font-smaller);
  color: var(--sp-success);
}
.specorator-vue-marketplace-card-name {
  font-weight: var(--sp-weight-semibold);
}
.specorator-vue-marketplace-card-desc {
  font-size: var(--sp-font-small);
  color: var(--sp-text-muted);
  user-select: text;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.specorator-vue-marketplace-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-space-2xs);
  margin-top: var(--sp-space-3xs);
}
</style>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:vue -- marketplaceCard`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/marketplace/vue/components/MarketplaceCard.vue tests/vue/marketplace/marketplaceCard.test.ts
git commit -m "Marketplace: vertical storefront card that opens the detail view"
```

---

## Task 3: MarketplaceNav (category tabs)

**Files:**
- Create: `src/features/marketplace/vue/components/MarketplaceNav.vue`
- Test: `tests/vue/marketplace/marketplaceNav.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { fireEvent, render, screen, within } from '@testing-library/vue';
import { describe, expect, it } from 'vitest';

import MarketplaceNav from '@/features/marketplace/vue/components/MarketplaceNav.vue';

const typeLabels = { 'quick-action': 'Quick Action', agent: 'Agent', loop: 'Loop', template: 'Template', skill: 'Skill' };

function renderNav(active: string, counts: Record<string, number>) {
  return render(MarketplaceNav, { props: { activeView: active, counts, typeLabels } });
}

describe('MarketplaceNav', () => {
  it('renders Home plus a tab only for present types, each with its count', () => {
    renderNav('home', { 'quick-action': 0, agent: 8, loop: 9, template: 0, skill: 0 });
    const bar = screen.getByRole('tablist', { name: 'Marketplace categories' });
    expect(within(bar).getByRole('tab', { name: 'Home' })).toBeTruthy();
    expect(within(bar).getByRole('tab', { name: /Agent/ })).toBeTruthy();
    expect(within(bar).getByRole('tab', { name: /Loop/ })).toBeTruthy();
    // Absent types get no tab.
    expect(within(bar).queryByRole('tab', { name: /Quick Action/ })).toBeNull();
    expect(within(bar).queryByRole('tab', { name: /Template/ })).toBeNull();
    // The count is shown.
    expect(within(bar).getByRole('tab', { name: /8/ })).toBeTruthy();
  });

  it('marks the active tab and emits select', async () => {
    const { emitted } = renderNav('agent', { 'quick-action': 0, agent: 8, loop: 9, template: 0, skill: 0 });
    const agentTab = screen.getByRole('tab', { name: /Agent/ });
    expect(agentTab.getAttribute('aria-selected')).toBe('true');
    await fireEvent.click(screen.getByRole('tab', { name: 'Home' }));
    expect(emitted().select?.[0]).toEqual(['home']);
    await fireEvent.click(agentTab);
    expect(emitted().select?.[1]).toEqual(['agent']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:vue -- marketplaceNav`
Expected: FAIL ("Failed to resolve import ... MarketplaceNav.vue").

- [ ] **Step 3: Create `MarketplaceNav.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue';

import { t } from '../../../../i18n/i18n';
import { MARKETPLACE_ITEM_TYPES, type MarketplaceItemType } from '../../catalogTypes';
import type { MarketplaceView } from '../marketplaceView';

const props = defineProps<{
  activeView: MarketplaceView;
  counts: Record<MarketplaceItemType, number>;
  typeLabels: Record<MarketplaceItemType, string>;
}>();
const emit = defineEmits<{ select: [view: MarketplaceView] }>();

// A category tab appears only when the catalog has items of that type, in
// canonical order — a fresh/empty catalog isn't shown dead tabs.
const presentTypes = computed(() => MARKETPLACE_ITEM_TYPES.filter((type) => props.counts[type] > 0));
</script>

<template>
  <div
    class="specorator-vue-marketplace-nav"
    role="tablist"
    :aria-label="t('marketplace.navGroupLabel')"
  >
    <button
      type="button"
      role="tab"
      class="specorator-vue-marketplace-navtab"
      :class="{ 'is-on': props.activeView === 'home' }"
      :aria-selected="props.activeView === 'home' ? 'true' : 'false'"
      @click="emit('select', 'home')"
    >
      {{ t('marketplace.nav.home') }}
    </button>
    <button
      v-for="type in presentTypes"
      :key="type"
      type="button"
      role="tab"
      class="specorator-vue-marketplace-navtab"
      :class="{ 'is-on': props.activeView === type }"
      :aria-selected="props.activeView === type ? 'true' : 'false'"
      @click="emit('select', type)"
    >
      {{ props.typeLabels[type] }}
      <span class="specorator-vue-marketplace-navcount">{{ props.counts[type] }}</span>
    </button>
  </div>
</template>

<style scoped>
.specorator-vue-marketplace-nav {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-space-2xs);
  align-items: center;
}
.specorator-vue-marketplace-navtab {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-space-2xs);
  font-size: var(--sp-font-small);
  padding: var(--sp-space-3xs) var(--sp-space-s);
  border-radius: var(--sp-radius-s);
  border: 1px solid transparent;
  cursor: pointer;
}
.specorator-vue-marketplace-navtab.is-on {
  background: var(--sp-accent);
  color: var(--sp-text-on-accent);
}
.specorator-vue-marketplace-navcount {
  font-size: var(--sp-font-smaller);
  opacity: 0.75;
}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:vue -- marketplaceNav`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/marketplace/vue/components/MarketplaceNav.vue tests/vue/marketplace/marketplaceNav.test.ts
git commit -m "Marketplace: primary category tab navigation"
```

---

## Task 4: MarketplaceGrid (grid + skeleton + empty)

**Files:**
- Create: `src/features/marketplace/vue/components/MarketplaceGrid.vue`
- Test: `tests/vue/marketplace/marketplaceGrid.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { render, screen } from '@testing-library/vue';
import { describe, expect, it } from 'vitest';

import type { MarketplaceItem } from '@/features/marketplace/catalogTypes';
import MarketplaceGrid from '@/features/marketplace/vue/components/MarketplaceGrid.vue';

const typeLabels = { 'quick-action': 'Quick Action', agent: 'Agent', loop: 'Loop', template: 'Template', skill: 'Skill' };
const items: MarketplaceItem[] = [
  { id: 'a', type: 'loop', name: 'Alpha', description: 'd', path: 'loops/a.md', tags: [] },
  { id: 'b', type: 'agent', name: 'Beta', description: 'd', path: 'agents/b.md', tags: [] },
];

describe('MarketplaceGrid', () => {
  it('renders a card per item', () => {
    render(MarketplaceGrid, { props: { items, installedIds: new Set(), typeLabels } });
    expect(document.querySelectorAll('.specorator-vue-marketplace-card')).toHaveLength(2);
  });

  it('renders skeleton cells while loading with no items yet', () => {
    render(MarketplaceGrid, { props: { items: [], installedIds: new Set(), typeLabels, loading: true, skeletonCount: 4 } });
    expect(document.querySelectorAll('.specorator-vue-marketplace-skeleton')).toHaveLength(4);
    expect(document.querySelectorAll('.specorator-vue-marketplace-card')).toHaveLength(0);
  });

  it('shows the empty state when not loading and no items', () => {
    render(MarketplaceGrid, { props: { items: [], installedIds: new Set(), typeLabels } });
    expect(screen.getByText('No items match your filters.')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:vue -- marketplaceGrid`
Expected: FAIL (import cannot be resolved).

- [ ] **Step 3: Create `MarketplaceGrid.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue';

import { t } from '../../../../i18n/i18n';
import type { MarketplaceItem, MarketplaceItemType } from '../../catalogTypes';
import MarketplaceCard from './MarketplaceCard.vue';

const props = withDefaults(
  defineProps<{
    items: MarketplaceItem[];
    installedIds: ReadonlySet<string>;
    typeLabels: Record<MarketplaceItemType, string>;
    loading?: boolean;
    skeletonCount?: number;
  }>(),
  { loading: false, skeletonCount: 6 },
);
const emit = defineEmits<{ open: [item: MarketplaceItem] }>();

// Skeleton stands in ONLY on the first load (no items yet); a refresh with a
// catalog already shown keeps the real cards visible.
const showSkeleton = computed(() => props.loading && props.items.length === 0);
</script>

<template>
  <div
    v-if="showSkeleton"
    class="specorator-vue-marketplace-grid"
    aria-hidden="true"
  >
    <div
      v-for="n in props.skeletonCount"
      :key="n"
      class="specorator-vue-marketplace-skeleton"
    />
  </div>
  <div
    v-else-if="props.items.length > 0"
    class="specorator-vue-marketplace-grid"
  >
    <MarketplaceCard
      v-for="item in props.items"
      :key="item.id"
      :item="item"
      :installed="props.installedIds.has(item.id)"
      :type-label="props.typeLabels[item.type]"
      @open="emit('open', item)"
    />
  </div>
  <div
    v-else
    class="specorator-vue-empty-text"
  >
    {{ t('marketplace.empty') }}
  </div>
</template>

<style scoped>
.specorator-vue-marketplace-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
  gap: var(--sp-space-s);
}
.specorator-vue-marketplace-skeleton {
  height: 8.5rem;
  border-radius: var(--sp-radius-m);
  border: 1px solid var(--sp-border);
  background: linear-gradient(
    90deg,
    var(--sp-surface-raised) 25%,
    var(--sp-surface-hover) 37%,
    var(--sp-surface-raised) 63%
  );
  background-size: 400% 100%;
  animation: sp-marketplace-shimmer 1.4s ease infinite;
}
@keyframes sp-marketplace-shimmer {
  0% { background-position: 100% 0; }
  100% { background-position: 0 0; }
}
@media (prefers-reduced-motion: reduce) {
  .specorator-vue-marketplace-skeleton { animation: none; }
}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:vue -- marketplaceGrid`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/marketplace/vue/components/MarketplaceGrid.vue tests/vue/marketplace/marketplaceGrid.test.ts
git commit -m "Marketplace: responsive card grid with skeleton loading"
```

---

## Task 5: MarketplaceHome (sectioned landing)

**Files:**
- Create: `src/features/marketplace/vue/components/MarketplaceHome.vue`
- Test: `tests/vue/marketplace/marketplaceHome.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { fireEvent, render, screen, within } from '@testing-library/vue';
import { describe, expect, it } from 'vitest';

import type { MarketplaceItem } from '@/features/marketplace/catalogTypes';
import MarketplaceHome from '@/features/marketplace/vue/components/MarketplaceHome.vue';

const typeLabels = { 'quick-action': 'Quick Action', agent: 'Agent', loop: 'Loop', template: 'Template', skill: 'Skill' };
function item(id: string, type: MarketplaceItem['type'], name: string): MarketplaceItem {
  return { id, type, name, description: 'd', path: `${type}/${id}.md`, tags: [] };
}
const sections = [
  { type: 'agent' as const, items: [item('a1', 'agent', 'A1'), item('a2', 'agent', 'A2')] },
  { type: 'loop' as const, items: [item('l1', 'loop', 'L1')] },
];

describe('MarketplaceHome', () => {
  it('renders one section per type with its count and cards', () => {
    render(MarketplaceHome, { props: { sections, installedIds: new Set(), typeLabels } });
    expect(screen.getByText('2 items')).toBeTruthy();
    expect(screen.getByText('1 items')).toBeTruthy();
    expect(document.querySelectorAll('.specorator-vue-marketplace-card')).toHaveLength(3);
  });

  it('caps a section at previewLimit cards', () => {
    render(MarketplaceHome, { props: { sections, installedIds: new Set(), typeLabels, previewLimit: 1 } });
    expect(document.querySelectorAll('.specorator-vue-marketplace-card')).toHaveLength(2);
  });

  it('emits seeAll(type) and open(item)', async () => {
    const { emitted } = render(MarketplaceHome, { props: { sections, installedIds: new Set(), typeLabels } });
    await fireEvent.click(screen.getAllByRole('button', { name: 'See all' })[0]);
    expect(emitted().seeAll?.[0]).toEqual(['agent']);
    await fireEvent.click(screen.getByRole('button', { name: 'A1' }));
    expect((emitted().open?.[0] as MarketplaceItem[])[0].id).toBe('a1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:vue -- marketplaceHome`
Expected: FAIL (import cannot be resolved).

- [ ] **Step 3: Create `MarketplaceHome.vue`**

```vue
<script setup lang="ts">
import { withDefaults } from 'vue';

import { t } from '../../../../i18n/i18n';
import type { MarketplaceItem, MarketplaceItemType } from '../../catalogTypes';
import MarketplaceCard from './MarketplaceCard.vue';

interface HomeSection {
  type: MarketplaceItemType;
  items: MarketplaceItem[];
}

const props = withDefaults(
  defineProps<{
    sections: HomeSection[];
    installedIds: ReadonlySet<string>;
    typeLabels: Record<MarketplaceItemType, string>;
    previewLimit?: number;
  }>(),
  { previewLimit: 4 },
);
const emit = defineEmits<{ open: [item: MarketplaceItem]; seeAll: [type: MarketplaceItemType] }>();

function capped(items: MarketplaceItem[]): MarketplaceItem[] {
  return items.slice(0, props.previewLimit);
}
</script>

<template>
  <div class="specorator-vue-marketplace-home">
    <div class="specorator-vue-marketplace-hero">
      <div class="specorator-vue-marketplace-hero-title">
        {{ t('marketplace.home.heading') }}
      </div>
      <div class="specorator-vue-marketplace-hero-sub">
        {{ t('marketplace.home.subheading') }}
      </div>
    </div>
    <section
      v-for="section in props.sections"
      :key="section.type"
      class="specorator-vue-marketplace-section"
    >
      <div class="specorator-vue-marketplace-section-head">
        <span class="specorator-vue-marketplace-section-title">
          {{ props.typeLabels[section.type] }}
          <span class="specorator-vue-marketplace-section-count">
            {{ t('marketplace.sectionCount', { count: section.items.length }) }}
          </span>
        </span>
        <button
          type="button"
          class="specorator-vue-marketplace-seeall"
          @click="emit('seeAll', section.type)"
        >
          {{ t('marketplace.seeAll') }}
        </button>
      </div>
      <div class="specorator-vue-marketplace-grid">
        <MarketplaceCard
          v-for="cardItem in capped(section.items)"
          :key="cardItem.id"
          :item="cardItem"
          :installed="props.installedIds.has(cardItem.id)"
          :type-label="props.typeLabels[cardItem.type]"
          @open="emit('open', cardItem)"
        />
      </div>
    </section>
  </div>
</template>

<style scoped>
.specorator-vue-marketplace-home {
  display: flex;
  flex-direction: column;
  gap: var(--sp-space-l);
}
.specorator-vue-marketplace-hero-title {
  font-size: 1.3em;
  font-weight: var(--sp-weight-semibold);
}
.specorator-vue-marketplace-hero-sub {
  color: var(--sp-text-muted);
  font-size: var(--sp-font-small);
  margin-top: var(--sp-space-3xs);
}
.specorator-vue-marketplace-section {
  display: flex;
  flex-direction: column;
  gap: var(--sp-space-s);
}
.specorator-vue-marketplace-section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-space-s);
}
.specorator-vue-marketplace-section-title {
  font-weight: var(--sp-weight-semibold);
}
.specorator-vue-marketplace-section-count {
  color: var(--sp-text-faint);
  font-size: var(--sp-font-smaller);
  font-weight: normal;
  margin-left: var(--sp-space-2xs);
}
.specorator-vue-marketplace-seeall {
  font-size: var(--sp-font-small);
  padding: var(--sp-space-3xs) var(--sp-space-xs);
  border-radius: var(--sp-radius-s);
  cursor: pointer;
}
.specorator-vue-marketplace-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
  gap: var(--sp-space-s);
}
</style>
```

> Note: `import { withDefaults } from 'vue'` is unnecessary (it is a compiler macro); remove that import line if lint flags it. The macro is available without importing.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:vue -- marketplaceHome`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/marketplace/vue/components/MarketplaceHome.vue tests/vue/marketplace/marketplaceHome.test.ts
git commit -m "Marketplace: sectioned storefront home landing"
```

---

## Task 6: MarketplaceDetail (in-island preview + install)

**Files:**
- Create: `src/features/marketplace/vue/components/MarketplaceDetail.vue`
- Test: `tests/vue/marketplace/marketplaceDetail.test.ts`

- [ ] **Step 1: Write the failing test** (absorbs source-link safety from the old card test)

```ts
import { fireEvent, render, screen } from '@testing-library/vue';
import { describe, expect, it } from 'vitest';

import type { MarketplaceItem } from '@/features/marketplace/catalogTypes';
import MarketplaceDetail from '@/features/marketplace/vue/components/MarketplaceDetail.vue';

function base(overrides: Partial<MarketplaceItem> = {}): MarketplaceItem {
  return { id: 'a', type: 'loop', name: 'Alpha', description: 'Alpha desc', path: 'loops/a.md', tags: ['t1'], ...overrides };
}
function renderDetail(props: Partial<Record<string, unknown>> = {}) {
  return render(MarketplaceDetail, {
    props: {
      item: base(), typeLabel: 'Loop', body: 'BODY', previewError: false,
      installing: false, installed: false, installable: true, ...props,
    },
  });
}

describe('MarketplaceDetail', () => {
  it('emits back', async () => {
    const { emitted } = renderDetail();
    await fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(emitted().back).toHaveLength(1);
  });

  it('shows the reviewed body and enables Install once it loads', async () => {
    const { emitted } = renderDetail({ body: 'REVIEWED' });
    expect(screen.getByText('REVIEWED')).toBeTruthy();
    const install = screen.getByRole('button', { name: 'Install' }) as HTMLButtonElement;
    expect(install.disabled).toBe(false);
    await fireEvent.click(install);
    expect(emitted().install).toHaveLength(1);
  });

  it('disables Install until the body has loaded', () => {
    renderDetail({ body: null });
    expect((screen.getByRole('button', { name: 'Install' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows Installed (not a button) when installed', () => {
    renderDetail({ installed: true });
    expect(screen.getByText('Installed')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull();
  });

  it('shows the not-installable note for non-installable types', () => {
    renderDetail({ item: base({ type: 'skill', id: 'skills/x', path: 'skills/x.md' }), installable: false, typeLabel: 'Skill' });
    expect(screen.getByText('Not yet installable')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull();
  });

  it('linkifies only http(s) sources', () => {
    const { container: c1 } = renderDetail({ item: base({ source: 'https://example.test/x' }) });
    expect(c1.querySelector('a[href="https://example.test/x"]')).not.toBeNull();
    const { container: c2 } = renderDetail({ item: base({ source: 'javascript:alert(1)' }) });
    expect(c2.querySelector('a')).toBeNull();
    expect(c2.textContent).toContain('javascript:alert(1)');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:vue -- marketplaceDetail`
Expected: FAIL (import cannot be resolved).

- [ ] **Step 3: Create `MarketplaceDetail.vue`**

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import { t } from '../../../../i18n/i18n';
import type { MarketplaceItem } from '../../catalogTypes';
import { iconForItem, mountIcon } from '../marketplaceIcons';

const props = defineProps<{
  item: MarketplaceItem;
  typeLabel: string;
  body: string | null;
  previewError: boolean;
  installing: boolean;
  installed: boolean;
  installable: boolean;
}>();
const emit = defineEmits<{ back: []; install: [] }>();

const iconEl = ref<HTMLElement | null>(null);
onMounted(() => {
  if (iconEl.value) mountIcon(iconEl.value, iconForItem(props.item));
});

const bodyText = computed(() =>
  props.previewError ? t('marketplace.loadError') : (props.body ?? t('marketplace.loading')),
);

// The catalog is untrusted: only an http(s) source becomes a live href (Vue does
// not sanitize :href, and a javascript: value would execute in the renderer).
const safeSourceUrl = computed(() => {
  const src = props.item.source;
  return src && /^https?:\/\//i.test(src) ? src : null;
});
</script>

<template>
  <div class="specorator-vue-marketplace-detail">
    <button
      type="button"
      class="specorator-vue-marketplace-back"
      @click="emit('back')"
    >
      {{ t('marketplace.detail.back') }}
    </button>
    <div class="specorator-vue-marketplace-detail-head">
      <div
        ref="iconEl"
        class="specorator-vue-marketplace-card-icon"
      />
      <div class="specorator-vue-marketplace-detail-titles">
        <div class="specorator-vue-marketplace-detail-name">
          {{ props.item.name }}
        </div>
        <span class="specorator-vue-marketplace-card-badge">{{ props.typeLabel }}</span>
      </div>
      <div class="specorator-vue-marketplace-detail-action">
        <span v-if="props.installed">{{ t('marketplace.installed') }}</span>
        <span
          v-else-if="!props.installable"
          class="specorator-vue-marketplace-note"
        >{{ t('marketplace.notInstallable') }}</span>
        <button
          v-else
          type="button"
          class="mod-cta"
          :disabled="props.installing || props.body === null"
          @click="emit('install')"
        >
          {{ props.installing ? t('marketplace.installing') : t('marketplace.install') }}
        </button>
      </div>
    </div>
    <div
      v-if="props.item.tags.length > 0"
      class="specorator-vue-marketplace-card-tags"
    >
      <span
        v-for="tag in props.item.tags"
        :key="tag"
        class="specorator-vue-chip"
      >{{ tag }}</span>
    </div>
    <p
      v-if="props.item.description"
      class="specorator-vue-marketplace-detail-desc"
    >
      {{ props.item.description }}
    </p>
    <pre class="specorator-vue-marketplace-body">{{ bodyText }}</pre>
    <div
      v-if="props.item.author || props.item.license || props.item.source"
      class="specorator-vue-marketplace-attribution"
    >
      <span v-if="props.item.author">{{ props.item.author }}</span>
      <span v-if="props.item.license">{{ props.item.license }}</span>
      <a
        v-if="safeSourceUrl"
        :href="safeSourceUrl"
        target="_blank"
        rel="noopener noreferrer"
      >{{ props.item.source }}</a>
      <span v-else-if="props.item.source">{{ props.item.source }}</span>
    </div>
  </div>
</template>

<style scoped>
.specorator-vue-marketplace-detail {
  display: flex;
  flex-direction: column;
  gap: var(--sp-space-s);
}
.specorator-vue-marketplace-back {
  align-self: flex-start;
  font-size: var(--sp-font-small);
  padding: var(--sp-space-3xs) var(--sp-space-xs);
  border-radius: var(--sp-radius-s);
  cursor: pointer;
}
.specorator-vue-marketplace-detail-head {
  display: flex;
  align-items: center;
  gap: var(--sp-space-s);
}
.specorator-vue-marketplace-card-icon {
  display: inline-flex;
  color: var(--sp-text-muted);
}
.specorator-vue-marketplace-card-icon :deep(svg) {
  width: 22px;
  height: 22px;
}
.specorator-vue-marketplace-detail-titles {
  display: flex;
  flex-direction: column;
  gap: var(--sp-space-3xs);
  flex: 1 1 auto;
  min-width: 0;
}
.specorator-vue-marketplace-detail-name {
  font-size: 1.15em;
  font-weight: var(--sp-weight-semibold);
}
.specorator-vue-marketplace-detail-action {
  flex: 0 0 auto;
}
.specorator-vue-marketplace-note {
  font-size: var(--sp-font-smaller);
  color: var(--sp-text-faint);
}
.specorator-vue-marketplace-detail-desc {
  color: var(--sp-text-muted);
  user-select: text;
}
.specorator-vue-marketplace-body {
  max-height: 24rem;
  margin: 0;
  padding: var(--sp-space-s);
  overflow: auto;
  font-family: var(--sp-mono);
  font-size: var(--sp-font-smaller);
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--sp-surface);
  border: 1px solid var(--sp-border);
  border-radius: var(--sp-radius-s);
  user-select: text;
}
.specorator-vue-marketplace-attribution {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-space-s);
  font-size: var(--sp-font-smaller);
  color: var(--sp-text-faint);
  user-select: text;
}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:vue -- marketplaceDetail`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/marketplace/vue/components/MarketplaceDetail.vue tests/vue/marketplace/marketplaceDetail.test.ts
git commit -m "Marketplace: in-island detail/preview view with gated install"
```

---

## Task 7: MarketplaceRoot orchestrator rewrite

**Files:**
- Modify: `src/features/marketplace/vue/MarketplaceRoot.vue`
- Test: `tests/vue/marketplace/marketplaceRoot.test.ts`

- [ ] **Step 1: Update `marketplaceRoot.test.ts`** — keep gate/settings/reuse/warning/live-sync tests; replace the type-facet chip tests with nav-tab tests and the inline-preview tests with detail tests. Specific edits:

  - Everywhere, replace `.marketplace-entry` with `.specorator-vue-marketplace-card`.
  - In "renders a card per item and marks the installed one": beta installed → `within(betaCard).getByText('Installed')` still holds; DELETE the `queryByRole('button', {name:'Preview'})` assertions; for alpha assert it is a clickable card with no Installed text:
    ```ts
    const alphaCard = screen.getByRole('button', { name: 'Alpha Loop' });
    expect(within(alphaCard).queryByText('Installed')).toBeNull();
    ```
  - Replace the entire `describe('MarketplaceRoot type filter', …)` block with:
    ```ts
    describe('MarketplaceRoot category nav', () => {
      beforeEach(() => vi.clearAllMocks());

      it('scopes the grid to the selected category tab and returns Home', async () => {
        setup(makeStore({ items: [alpha, beta] }), { marketplaceNetworkEnabled: true });
        await screen.findByText('Alpha Loop');
        const nav = screen.getByRole('tablist', { name: 'Marketplace categories' });
        await fireEvent.click(within(nav).getByRole('tab', { name: /Agent/ }));
        await waitFor(() => {
          expect(document.querySelectorAll('.specorator-vue-marketplace-card')).toHaveLength(1);
        });
        expect(screen.queryByText('Alpha Loop')).toBeNull();
        expect(screen.getByText('Beta Agent')).toBeTruthy();
        await fireEvent.click(within(nav).getByRole('tab', { name: 'Home' }));
        await waitFor(() => {
          expect(document.querySelectorAll('.specorator-vue-marketplace-card')).toHaveLength(2);
        });
      });

      it('falls back to Home when the active category leaves the reloaded catalog', async () => {
        const store = reactive(makeStore({ items: [alpha, beta] }));
        setup(store as StoreFake, { marketplaceNetworkEnabled: true, marketplaceNetworkWarningShown: true });
        await screen.findByText('Alpha Loop');
        const nav = screen.getByRole('tablist', { name: 'Marketplace categories' });
        await fireEvent.click(within(nav).getByRole('tab', { name: /Loop/ }));
        await waitFor(() => expect(screen.queryByText('Beta Agent')).toBeNull());
        store.items = [beta];
        await nextTick();
        await waitFor(() => {
          expect(document.querySelectorAll('.specorator-vue-marketplace-card')).toHaveLength(1);
          expect(screen.getByText('Beta Agent')).toBeTruthy();
        });
      });
    });
    ```
  - In `describe('MarketplaceRoot preview + install', …)`, replace the `getByRole('button', { name: 'Preview' })` click with a card click, and open the detail first:
    - "installs the exact body shown…": 
      ```ts
      expect(screen.queryByRole('button', { name: 'Install' })).toBeNull(); // no install from the grid
      await fireEvent.click(screen.getByRole('button', { name: 'Alpha Loop' })); // open detail
      await screen.findByText('BODY TEXT');
      expect(store.fetchBody).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
      await fireEvent.click(screen.getByRole('button', { name: 'Install' }));
      await waitFor(() => expect(store.install).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), 'BODY TEXT'));
      ```
    - "keeps Install disabled…": open with a card click instead of Preview; the rest is unchanged.
  - In `describe('MarketplaceRoot network warning + preview invalidation', …)`:
    - "drops cached previews when the catalog reloads": open the detail via card click, assert `OLD BODY` shows, reassign `store.items`, then assert the detail closed (`OLD BODY` gone AND the grid is back):
      ```ts
      await fireEvent.click(screen.getByRole('button', { name: 'Alpha Loop' }));
      await screen.findByText('OLD BODY');
      store.items = [{ ...alpha }];
      await nextTick();
      await waitFor(() => expect(screen.queryByText('OLD BODY')).toBeNull());
      ```
    - "discards a preview body that resolves AFTER a catalog reload": same idea — open via card click; after reload + late resolve, re-open the card and assert `FRESH BODY`, `STALE BODY` absent, `fetchBody` called twice.
  - The `awaits the one-time network warning` and `installed-badge live-sync` blocks are unchanged.
  - Ensure `nextTick`, `within`, `reactive` remain imported (already are).

- [ ] **Step 2: Run the updated test to verify it fails against the current Root**

Run: `npm run test:vue -- marketplaceRoot`
Expected: FAIL (current Root renders the chip facet / inline preview, no `tablist`, no `.specorator-vue-marketplace-card`).

- [ ] **Step 3: Rewrite `MarketplaceRoot.vue`** — script:

```vue
<script setup lang="ts">
import { Notice } from 'obsidian';
import { computed, inject, onMounted, onUnmounted, reactive, ref, watch } from 'vue';

import { t } from '../../../i18n/i18n';
import LibraryToolbar from '../../library/vue/components/LibraryToolbar.vue';
import { useLibraryList } from '../../library/vue/useLibraryList';
import {
  isInstallableType,
  MARKETPLACE_ITEM_TYPES,
  type MarketplaceItem,
  type MarketplaceItemType,
} from '../catalogTypes';
import { maybeWarnMarketplaceNetwork } from '../marketplaceNetworkGate';
import MarketplaceDetail from './components/MarketplaceDetail.vue';
import MarketplaceGrid from './components/MarketplaceGrid.vue';
import MarketplaceHome from './components/MarketplaceHome.vue';
import MarketplaceNav from './components/MarketplaceNav.vue';
import { marketplaceAccessors } from './marketplaceAccessors';
import { PLUGIN_KEY } from './marketplaceKeys';
import { marketplaceTypeLabels } from './marketplaceTypeLabels';
import type { MarketplaceView } from './marketplaceView';
import { useMarketplaceStore } from './stores/marketplaceStore';
import { useMarketplaceInstalledRefresh } from './useMarketplaceInstalledRefresh';

const injectedPlugin = inject(PLUGIN_KEY);
if (!injectedPlugin) throw new Error('MarketplaceRoot mounted without PLUGIN_KEY');
const plugin = injectedPlugin;

const store = useMarketplaceStore();
store.init(plugin);
useMarketplaceInstalledRefresh(plugin, () => {
  void store.refreshInstalled();
});

const typeLabels = marketplaceTypeLabels();

// Primary navigation state.
const activeView = ref<MarketplaceView>('home');
const detailId = ref<string | null>(null);

// Per-type counts feed the nav tabs; derived from the loaded catalog.
const counts = computed<Record<MarketplaceItemType, number>>(() => {
  const tally: Record<MarketplaceItemType, number> = {
    'quick-action': 0, agent: 0, loop: 0, template: 0, skill: 0,
  };
  for (const item of store.items) tally[item.type] += 1;
  return tally;
});

// Search/sort/tag facet over the ACTIVE scope — all items on Home, else the
// selected category. A query or tag drops out of the Home sections into a grid.
const list = useLibraryList<MarketplaceItem>(
  () =>
    activeView.value === 'home'
      ? store.items
      : store.items.filter((item) => item.type === activeView.value),
  marketplaceAccessors,
);

// Home landing sections: every present type, canonical order.
const sections = computed(() =>
  MARKETPLACE_ITEM_TYPES.map((type) => ({
    type,
    items: store.items.filter((item) => item.type === type),
  })).filter((section) => section.items.length > 0),
);

const showHome = computed(
  () =>
    activeView.value === 'home' &&
    list.query.value === '' &&
    list.activeFilters.value.length === 0,
);
const showSkeleton = computed(() => store.loading && store.items.length === 0);
const detailItem = computed(() => store.items.find((item) => item.id === detailId.value) ?? null);

// If the active category leaves a reloaded catalog (count → 0), fall back to Home
// so the grid can't strand on an absent type (mirrors useLibraryList's tag-prune).
watch(counts, (tally) => {
  if (activeView.value !== 'home' && tally[activeView.value] === 0) activeView.value = 'home';
});

const enabled = ref(plugin.settings.marketplaceNetworkEnabled === true);

// Generation-guarded body cache: opening the detail fetches the body once; a
// catalog reload clears the cache AND closes the detail so no stale body/id
// survives a source switch.
const bodies = reactive<Record<string, string>>({});
const previewErrors = reactive<Record<string, boolean>>({});
const installing = reactive<Record<string, boolean>>({});
let catalogGeneration = 0;
watch(
  () => store.items,
  () => {
    catalogGeneration += 1;
    detailId.value = null;
    for (const key of Object.keys(bodies)) delete bodies[key];
    for (const key of Object.keys(previewErrors)) delete previewErrors[key];
  },
);

onMounted(async () => {
  if (enabled.value && !store.loaded) {
    await maybeWarnMarketplaceNetwork(plugin);
    void store.load();
  } else if (enabled.value) {
    void store.refreshInstalled();
  }
});

async function enable(): Promise<void> {
  plugin.settings.marketplaceNetworkEnabled = true;
  await plugin.saveSettings();
  await maybeWarnMarketplaceNetwork(plugin);
  enabled.value = true;
  await store.load();
}

let settingsChangedOff: (() => void) | null = null;
onMounted(() => {
  settingsChangedOff = plugin.events.on('settings-changed', () => {
    void syncEnabled();
  });
});
onUnmounted(() => {
  settingsChangedOff?.();
  settingsChangedOff = null;
});

async function syncEnabled(): Promise<void> {
  const nowEnabled = plugin.settings.marketplaceNetworkEnabled === true;
  const wasEnabled = enabled.value;
  enabled.value = nowEnabled;
  if (nowEnabled && !wasEnabled && !store.loaded) {
    await maybeWarnMarketplaceNetwork(plugin);
    void store.load();
  }
}

function selectView(view: MarketplaceView): void {
  activeView.value = view;
  detailId.value = null;
}

async function openItem(item: MarketplaceItem): Promise<void> {
  detailId.value = item.id;
  if (bodies[item.id] === undefined) {
    const generation = catalogGeneration;
    try {
      previewErrors[item.id] = false;
      const body = await store.fetchBody(item);
      if (generation !== catalogGeneration) return;
      bodies[item.id] = body;
    } catch {
      if (generation !== catalogGeneration) return;
      previewErrors[item.id] = true;
    }
  }
}

function backToList(): void {
  detailId.value = null;
}

async function install(item: MarketplaceItem): Promise<void> {
  const body = bodies[item.id];
  if (body === undefined) return;
  installing[item.id] = true;
  try {
    const outcome = await store.install(item, body);
    new Notice(
      outcome === 'installed'
        ? t('marketplace.installedNotice', { name: item.name })
        : t('marketplace.skippedNotice', { name: item.name }),
    );
  } catch {
    new Notice(t('marketplace.failedNotice', { name: item.name }));
  } finally {
    installing[item.id] = false;
  }
}
</script>
```

Template:
```vue
<template>
  <div
    v-if="!enabled"
    class="specorator-vue-marketplace-gate"
  >
    <p class="specorator-vue-empty-text">
      {{ t('marketplace.enablePrompt') }}
    </p>
    <button
      type="button"
      class="mod-cta"
      @click="enable()"
    >
      {{ t('marketplace.enableButton') }}
    </button>
  </div>
  <template v-else>
    <div class="specorator-vue-panel-header">
      <MarketplaceNav
        :active-view="activeView"
        :counts="counts"
        :type-labels="typeLabels"
        @select="selectView"
      />
      <div class="specorator-vue-panel-actions">
        <button
          type="button"
          :disabled="store.loading"
          @click="store.load()"
        >
          {{ t('marketplace.refresh') }}
        </button>
      </div>
    </div>

    <div
      v-if="store.error"
      class="specorator-vue-marketplace-banner is-error"
      role="alert"
    >
      {{ t('marketplace.loadError') }} {{ store.error }}
    </div>
    <div
      v-if="store.offline"
      class="specorator-vue-marketplace-banner is-offline"
      role="status"
    >
      {{ t('marketplace.offline') }}
    </div>

    <MarketplaceDetail
      v-if="detailItem"
      :item="detailItem"
      :type-label="typeLabels[detailItem.type]"
      :body="bodies[detailItem.id] ?? null"
      :preview-error="!!previewErrors[detailItem.id]"
      :installing="!!installing[detailItem.id]"
      :installed="store.installedIds.has(detailItem.id)"
      :installable="isInstallableType(detailItem.type)"
      @back="backToList"
      @install="install(detailItem)"
    />
    <template v-else>
      <LibraryToolbar
        v-if="store.items.length > 0"
        :query="list.query.value"
        :sort="list.sort.value"
        :tags="list.allTags.value"
        :active-filters="list.activeFilters.value"
        @update:query="list.query.value = $event"
        @update:sort="list.sort.value = $event"
        @toggle-filter="list.toggleFilter($event)"
        @clear-filters="list.clearFilters()"
      />
      <MarketplaceHome
        v-if="showHome && !showSkeleton"
        :sections="sections"
        :installed-ids="store.installedIds"
        :type-labels="typeLabels"
        @open="openItem"
        @see-all="selectView"
      />
      <MarketplaceGrid
        v-else
        :items="list.rows.value"
        :installed-ids="store.installedIds"
        :type-labels="typeLabels"
        :loading="showSkeleton"
        @open="openItem"
      />
    </template>

    <div class="specorator-vue-marketplace-source">
      {{ t('marketplace.source', { source: store.source }) }}
    </div>
  </template>
</template>
```

Style: keep the existing `.specorator-vue-marketplace-gate`, `.specorator-vue-marketplace-banner{,.is-error}`, and `.specorator-vue-marketplace-source` blocks. DELETE the `.specorator-vue-marketplace-typefilter` / `.specorator-vue-marketplace-typechip*` blocks (the facet is gone).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:vue -- marketplaceRoot`
Expected: PASS.

- [ ] **Step 5: Verify removed i18n keys are truly unreferenced**

Run: `grep -rn "marketplace.allTypes\|marketplace.typeFilterGroupLabel\|marketplace.preview" src/ || echo clean`
Expected: `clean`.

- [ ] **Step 6: Commit**

```bash
git add src/features/marketplace/vue/MarketplaceRoot.vue tests/vue/marketplace/marketplaceRoot.test.ts
git commit -m "Marketplace: orchestrate storefront nav, home, grid, and detail"
```

---

## Task 8: Docs, gates, and full verification

**Files:**
- Modify: `src/features/marketplace/CLAUDE.md`, root `CLAUDE.md`

- [ ] **Step 1: Update `src/features/marketplace/CLAUDE.md`** — in the Layout table, add rows for `vue/components/MarketplaceNav.vue`, `MarketplaceHome.vue`, `MarketplaceGrid.vue`, `MarketplaceDetail.vue`, `vue/marketplaceView.ts`, `vue/marketplaceIcons.ts`; revise the `MarketplaceRoot.vue` and `MarketplaceCard.vue` rows to describe the orchestrator + vertical card; add a one-line "storefront: nav tabs → Home sections / category grid → in-island detail; chrome-first skeleton loading" note. Re-point the "Install lives ONLY inside the preview" invariant at `MarketplaceDetail`. Update the Tests section to list the new specs.

- [ ] **Step 2: Update the root `CLAUDE.md` marketplace row** — append "Storefront UX: primary category tab nav, sectioned Home landing, responsive card grid, and an in-island detail/preview view over the reused Library list/toolbar; chrome-first skeleton loading."

- [ ] **Step 3: Run the full gate**

Run: `npm run typecheck && npm run typecheck:vue && npm run lint && npm run test:vue && npm run test -- --selectProjects unit --selectProjects integration`
Expected: all PASS. Fix any lint (e.g., remove a stray `withDefaults` import; import ordering) or type errors surfaced.

- [ ] **Step 4: Run the build + artifact/style/loc/quality gates**

Run: `npm run build && npm run check:loc && npm run check:css && npm run check:quality`
Expected: PASS. If `check:loc` flags a stale `MarketplaceRoot.vue` baseline entry, remove it. If `check:quality` fails on changed metrics, follow `docs/build-ci/quality-gates.md` to re-lock the baseline (`npm run quality` to inspect, update `scripts/quality-baseline.json`) and include it in the commit.

- [ ] **Step 5: Commit docs + any baseline updates**

```bash
git add src/features/marketplace/CLAUDE.md CLAUDE.md scripts/quality-baseline.json scripts/loc-baseline.json
git commit -m "Marketplace: document the storefront UX and re-lock quality gates"
```

- [ ] **Step 6: Manual verification (real app)** — via the `verify`/`run` skill or a manual pass: enable the Marketplace, confirm the nav tabs + Home sections render instantly with a skeleton during fetch, a category tab scopes the grid, a card opens the detail, Install is disabled until the body loads and installs the reviewed body, and the offline banner + cached grid still work.

- [ ] **Step 7: Push + open PR**

```bash
git push -u origin claude/marketplace-ux-improvements-328vb4
```
Then open a ready-for-review PR against the default branch (mirror any repo PR template).

---

## Self-review notes

- **Spec coverage:** G1 (Nav, Task 3), G2 (Home, Task 5), G3 (Grid + Card, Tasks 2/4), G4 (Detail, Task 6), G5 (skeleton in Grid + chrome-first Root routing, Tasks 4/7). Security invariants preserved in Detail + Root (Tasks 6/7). i18n parity (Task 1). Docs + gates (Task 8).
- **Type consistency:** `MarketplaceView` used identically in `marketplaceView.ts`, Nav, and Root. `open`/`select`/`seeAll`/`back`/`install` emit names match across producers/consumers. `counts: Record<MarketplaceItemType, number>` shape consistent. `iconForItem`/`mountIcon` signatures consistent across Card/Detail.
- **Ordering caveat:** Task 1 Step 5's dangling-reference grep only reads `clean` after Task 7 removes the last `marketplace.preview`/`allTypes` references; that's called out in both places.
