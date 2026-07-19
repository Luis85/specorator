<script setup lang="ts">
import { Notice } from 'obsidian';
import { computed, inject, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';

import { ProviderRegistry } from '../../../core/providers/ProviderRegistry';
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
import {
  SKILL_PROVIDER_TARGETS,
  type SkillInstallTarget,
  type SkillProviderTarget,
} from '../skillInstallTargets';
import MarketplaceDetail from './components/MarketplaceDetail.vue';
import MarketplaceGrid from './components/MarketplaceGrid.vue';
import MarketplaceHome from './components/MarketplaceHome.vue';
import MarketplaceNav from './components/MarketplaceNav.vue';
import { marketplaceAccessors } from './marketplaceAccessors';
import { PLUGIN_KEY, REQUESTED_VIEW_KEY } from './marketplaceKeys';
import { marketplaceTypeLabels } from './marketplaceTypeLabels';
import type { MarketplaceView } from './marketplaceView';
import { useMarketplaceStore } from './stores/marketplaceStore';
import { useMarketplaceInstalledRefresh } from './useMarketplaceInstalledRefresh';

const injectedPlugin = inject(PLUGIN_KEY);
if (!injectedPlugin) throw new Error('MarketplaceRoot mounted without PLUGIN_KEY');
// Re-bind after the guard so the closure-captured binding's DECLARED type is
// already narrowed to SpecoratorPlugin — vue-tsc widens a guard-narrowed
// inject() result back to `| undefined` inside nested functions like enable().
const plugin = injectedPlugin;

const store = useMarketplaceStore();
store.init(plugin);

// Per-leaf deep-link target, owned + provided by THIS leaf's MarketplaceView (null
// when opened normally). Scoping it per leaf is what stops another Marketplace
// leaf from consuming this leaf's request.
const requestedView = inject(REQUESTED_VIEW_KEY, null);

// Live-sync the Installed badges with mutations OUTSIDE the marketplace (a
// Library delete/rename, a roster change) — the shared store means each leaf
// subscribes independently, torn down per-leaf on unmount.
useMarketplaceInstalledRefresh(plugin, () => {
  void store.refreshInstalled();
});

const typeLabels = marketplaceTypeLabels();

// Primary navigation state: the active category (or Home), and which item's
// detail/preview is open.
const activeView = ref<MarketplaceView>('home');
const detailId = ref<string | null>(null);
const navRef = ref<InstanceType<typeof MarketplaceNav> | null>(null);

// Per-type counts feed the nav tabs; derived from the loaded catalog.
const counts = computed<Record<MarketplaceItemType, number>>(() => {
  const tally: Record<MarketplaceItemType, number> = {
    'quick-action': 0,
    agent: 0,
    loop: 0,
    template: 0,
    skill: 0,
  };
  for (const item of store.items) tally[item.type] += 1;
  return tally;
});

// Search/sort/tag facet over the ACTIVE scope — all items on Home, else the
// selected category. A query or tag drops out of the Home sections into a flat
// results grid (the storefront "search from anywhere" behavior).
const list = useLibraryList<MarketplaceItem>(
  () =>
    activeView.value === 'home'
      ? store.items
      : store.items.filter((item) => item.type === activeView.value),
  marketplaceAccessors,
);

// Home landing sections: every present type, canonical order. Grouped from the
// SORTED `list.rows` (not raw store.items) so the toolbar sort applies to the
// Home sections too — on Home the query/tag facets are empty (showHome requires
// it), so rows here are the full catalog in the chosen sort order.
const sections = computed(() =>
  MARKETPLACE_ITEM_TYPES.map((type) => ({
    type,
    items: list.rows.value.filter((item) => item.type === type),
  })).filter((section) => section.items.length > 0),
);

// Route to Home only when NO effective facet is active. Trim the query to match
// applyLibraryQuery, which trims before filtering — a whitespace-only search
// returns the full catalog, so it must keep the Home landing rather than drop
// into the flat results grid.
const showHome = computed(
  () =>
    activeView.value === 'home' &&
    list.query.value.trim() === '' &&
    list.activeFilters.value.length === 0,
);
const showSkeleton = computed(() => store.loading && store.items.length === 0);
const detailItem = computed(() => store.items.find((item) => item.id === detailId.value) ?? null);

// Fall a stranded category back to Home — whether it leaves a reloaded catalog
// (counts change), a deep-link selects a category the loaded catalog has zero of
// (activeView changes but counts don't), a valid but EMPTY catalog just landed,
// or a hard load FAILURE finished (an error, no catalog). Keyed on the load being
// SETTLED (not on item count) so a deep-link applied BEFORE the first load isn't
// bounced pre-fetch. "Settled" = not loading AND (a catalog landed OR a hard
// failure set an error): a hard failure leaves `loaded` false by design (so it
// retries on reopen), but a deep-linked category must still fall back to the
// error banner + Home instead of stranding on an empty category grid whose nav
// button is absent. Mirrors useLibraryList's tag-prune.
watch([counts, activeView, () => store.loaded, () => store.error, () => store.loading], () => {
  const view = activeView.value;
  if (view === 'home') return;
  const settled = !store.loading && (store.loaded || store.error !== null);
  if (settled && counts.value[view] === 0) activeView.value = 'home';
});

// Opt-in network gate: the Marketplace is dark until the user enables it, so
// merely opening the view never touches the network.
const enabled = ref(plugin.settings.marketplaceNetworkEnabled === true);

// Generation-guarded preview body cache. Opening the detail fetches the body
// once; `bodies` holds ONLY successfully-fetched content, a failed fetch sets
// `previewErrors` instead (so the error banner is never mistaken for reviewable
// content and can never be installed). A catalog reload clears the cache AND
// closes the detail so no stale body/id survives a source switch.
const bodies = reactive<Record<string, string>>({});
const previewErrors = reactive<Record<string, boolean>>({});
const installing = reactive<Record<string, boolean>>({});
// Per-item request token: reopening a card while its body is still loading starts
// a second fetch, so ONLY the latest attempt may write bodies/previewErrors. Two
// overlapping fetches disagreeing (one succeeds, one fails) would otherwise leave
// `bodies` populated AND `previewErrors` true — the detail showing the error while
// Install (which only checks body !== null) stays enabled on a body never shown.
const previewSeq = new Map<string, number>();
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
  // Auto-load only on the FIRST enabled mount that finds the shared store empty.
  // The module-singleton store retains the catalog across leaf open/close, so
  // reopening reuses it and refreshes on demand (Refresh) — no redundant fetch.
  if (enabled.value && !store.loaded) {
    // The one-time network/provenance warning fires here too, BEFORE the first
    // fetch: the settings tab can flip the opt-in without going through enable(),
    // so an already-enabled view would otherwise dial GitHub before the notice.
    await maybeWarnMarketplaceNetwork(plugin);
    void store.load();
  } else if (enabled.value) {
    // Reusing a retained catalog: while every leaf was closed no subscription was
    // live, so run one installed-scan now so badges aren't stale on reopen —
    // network-free and generation/sequence-guarded.
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

// The Settings tab can flip marketplaceNetworkEnabled while this leaf shows the
// gate, but plugin.settings isn't reactive and Obsidian Settings is a modal over
// this same leaf. Re-read the gate on settings-changed: a view enabled from
// Settings then warns + loads exactly like the mount path.
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

// "See all" on a Home section unmounts MarketplaceHome (and the button the user
// activated), which would strand keyboard focus on <body>. After the category
// renders, hand focus to the now-active nav button so Tab order stays sensible.
function openCategory(view: MarketplaceView): void {
  selectView(view);
  void nextTick(() => navRef.value?.focusActive());
}

// Apply a deep-link requested for THIS leaf (the Library "Browse Marketplace"
// link → activateMarketplace → the revealed leaf's view.requestView, provided as
// a per-leaf ref) and consume it so a later change can't re-navigate. Non-
// immediate: the request is always set AFTER this Root mounts (post
// loadIfDeferred). The counts guard falls a stranded category back to Home.
watch(
  () => requestedView?.value ?? null,
  (view) => {
    if (!view) return;
    selectView(view);
    if (requestedView) requestedView.value = null;
  },
);

async function openItem(item: MarketplaceItem): Promise<void> {
  detailId.value = item.id;
  if (bodies[item.id] !== undefined) return;
  const seq = (previewSeq.get(item.id) ?? 0) + 1;
  previewSeq.set(item.id, seq);
  const generation = catalogGeneration;
  // A result may only land if the catalog hasn't reloaded under it (generation)
  // AND this is still the latest fetch for the id (token) — so overlapping
  // fetches can't both write, and a stale one can't repopulate a cleared cache.
  const isCurrent = (): boolean =>
    generation === catalogGeneration && previewSeq.get(item.id) === seq;
  try {
    previewErrors[item.id] = false;
    const body = await store.fetchBody(item);
    if (!isCurrent()) return;
    bodies[item.id] = body;
  } catch {
    if (!isCurrent()) return;
    previewErrors[item.id] = true;
  }
}

function backToList(): void {
  detailId.value = null;
}

// Skill install targets: the three providers that own a skill root, labeled from
// the registry (falling back to the id if a provider isn't registered).
const skillProviderOptions = computed(() =>
  SKILL_PROVIDER_TARGETS.map((id) => ({ id, label: providerLabel(id) })),
);

function providerLabel(id: SkillProviderTarget): string {
  try {
    return ProviderRegistry.getProviderDisplayName(id);
  } catch {
    return id;
  }
}

// Passed to the detail so it can reflect whether the CURRENTLY selected target
// already holds the skill (per-target, unlike the "installed anywhere" badge).
// Tolerates a null item (vue-tsc doesn't narrow the v-if'd detailItem in bindings).
function skillInstalledChecker(item: MarketplaceItem | null): (target: SkillInstallTarget) => Promise<boolean> {
  return (target) =>
    item ? store.isSkillInstalledAt(item, target.provider, target.scope) : Promise.resolve(false);
}

async function install(item: MarketplaceItem, target?: SkillInstallTarget): Promise<void> {
  // Install the reviewed body only; if the preview hasn't loaded it yet, there
  // is nothing vetted to install (the button is disabled in this state too).
  const body = bodies[item.id];
  if (body === undefined) return;
  installing[item.id] = true;
  try {
    const outcome = await store.install(item, body, target);
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
        ref="navRef"
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
      :skill-provider-options="skillProviderOptions"
      :skill-installed-checker="skillInstalledChecker(detailItem)"
      :installed-signal="store.installedIds"
      @back="backToList"
      @install="(target) => detailItem && install(detailItem, target)"
    />
    <template v-else>
      <LibraryToolbar
        v-if="store.items.length > 0 || store.loading"
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
        @see-all="openCategory"
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

<style scoped>
.specorator-vue-marketplace-gate {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-space-s);
  text-align: center;
  padding: var(--sp-space-xl) var(--sp-space-l);
}

.specorator-vue-marketplace-banner {
  font-size: var(--sp-font-small);
  color: var(--sp-text-muted);
  padding: var(--sp-space-xs) var(--sp-space-s);
  margin-bottom: var(--sp-space-s);
  border: 1px solid var(--sp-border);
  border-radius: var(--sp-radius-s);
  background: var(--sp-surface-raised);
}

.specorator-vue-marketplace-banner.is-error {
  color: var(--sp-text-error);
  border-color: var(--sp-text-error);
}

.specorator-vue-marketplace-source {
  margin-top: var(--sp-space-l);
  font-size: var(--sp-font-smaller);
  color: var(--sp-text-faint);
  user-select: text;
}
</style>
