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
// Re-bind after the guard so the closure-captured binding's DECLARED type is
// already narrowed to SpecoratorPlugin — vue-tsc widens a guard-narrowed
// inject() result back to `| undefined` inside nested functions like enable().
const plugin = injectedPlugin;

const store = useMarketplaceStore();
store.init(plugin);

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

const showHome = computed(
  () =>
    activeView.value === 'home' &&
    list.query.value === '' &&
    list.activeFilters.value.length === 0,
);
const showSkeleton = computed(() => store.loading && store.items.length === 0);
const detailItem = computed(() => store.items.find((item) => item.id === detailId.value) ?? null);

// Fall a stranded category back to Home — whether it leaves a reloaded catalog
// (counts change) OR a deep-link selects a category the RETAINED catalog has zero
// of (activeView changes but counts don't, so watching counts alone would miss
// it). Gated on a non-empty catalog so a deep-link applied BEFORE the first load
// isn't bounced pre-fetch — the post-load counts change re-checks it. Mirrors
// useLibraryList's tag-prune.
watch([counts, activeView], ([tally, view]) => {
  if (view === 'home') return;
  if (store.items.length > 0 && tally[view] === 0) activeView.value = 'home';
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

// Apply a deep-link requested from outside the view (the Library's "Browse
// Marketplace" link, via activateMarketplace → store.requestView) and consume it
// so a later remount doesn't re-navigate. `immediate` covers a fresh leaf that
// mounts AFTER the request was recorded; the reactive path covers an already-open
// leaf. The counts guard falls a stranded category back to Home once loaded.
watch(
  () => store.requestedView,
  (view) => {
    if (!view) return;
    selectView(view);
    store.requestView(null);
  },
  { immediate: true },
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

async function install(item: MarketplaceItem): Promise<void> {
  // Install the reviewed body only; if the preview hasn't loaded it yet, there
  // is nothing vetted to install (the button is disabled in this state too).
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
