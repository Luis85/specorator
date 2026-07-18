<script setup lang="ts">
import { Notice } from 'obsidian';
import type { Ref } from 'vue';
import { computed, inject, onMounted, reactive, ref, shallowRef, watch } from 'vue';

import { t } from '../../../i18n/i18n';
import LibraryToolbar from '../../library/vue/components/LibraryToolbar.vue';
import { useLibraryList } from '../../library/vue/useLibraryList';
import { MARKETPLACE_ITEM_TYPES, type MarketplaceItem, type MarketplaceItemType } from '../catalogTypes';
import { maybeWarnMarketplaceNetwork } from '../marketplaceNetworkGate';
import MarketplaceCard from './components/MarketplaceCard.vue';
import { marketplaceAccessors } from './marketplaceAccessors';
import { PLUGIN_KEY } from './marketplaceKeys';
import { marketplaceTypeLabels } from './marketplaceTypeLabels';
import { useMarketplaceStore } from './stores/marketplaceStore';

const injectedPlugin = inject(PLUGIN_KEY);
if (!injectedPlugin) throw new Error('MarketplaceRoot mounted without PLUGIN_KEY');
// Re-bind after the guard so the closure-captured binding's DECLARED type is
// already narrowed to SpecoratorPlugin — vue-tsc widens a guard-narrowed
// inject() result back to `| undefined` inside nested functions like enable().
const plugin = injectedPlugin;

const store = useMarketplaceStore();
store.init(plugin);

// Marketplace-local type facet: narrows the source BEFORE useLibraryList, so the
// shared search/sort/tag facet (and its tag chips) operate on the type-filtered
// subset. Kept out of the shared LibraryToolbar because the Library panels are
// each already one-type-per-tab and would inherit a facet they can't use.
const activeTypes = shallowRef<ReadonlySet<MarketplaceItemType>>(new Set<MarketplaceItemType>());
// Source-based list: rows re-derive from the shared store, so a fetch in ANY
// Marketplace leaf updates every mounted view (multi-leaf consistency).
const list = useLibraryList<MarketplaceItem>(
  () => store.items.filter((item) => activeTypes.value.size === 0 || activeTypes.value.has(item.type)),
  marketplaceAccessors,
);
const typeLabels = marketplaceTypeLabels();
// Only offer chips for types actually present, in canonical order — a fresh vault
// browsing the whole catalog isn't shown dead filters (e.g. Skill with no items).
const availableTypes = computed(() =>
  MARKETPLACE_ITEM_TYPES.filter((type) => store.items.some((item) => item.type === type)),
);
function toggleType(type: MarketplaceItemType): void {
  const next = new Set<MarketplaceItemType>(activeTypes.value);
  if (next.has(type)) next.delete(type);
  else next.add(type);
  activeTypes.value = next;
}
function clearTypes(): void {
  if (activeTypes.value.size > 0) activeTypes.value = new Set<MarketplaceItemType>();
}
// Prune a type filter whose type vanished from the (re)loaded catalog, mirroring
// useLibraryList's tag-prune, so a source switch can't strand the list on an
// absent type (which would render empty with no visible cause).
watch(
  availableTypes,
  (types) => {
    if (activeTypes.value.size === 0) return;
    const allowed = new Set(types);
    const pruned = new Set([...activeTypes.value].filter((type) => allowed.has(type)));
    if (pruned.size !== activeTypes.value.size) activeTypes.value = pruned;
  },
  { flush: 'sync' },
);

// Opt-in network gate: the Marketplace is dark until the user enables it, so
// merely opening the view never touches the network.
const enabled = ref(plugin.settings.marketplaceNetworkEnabled === true);
// Preview is lazy: the body is fetched only when a card is expanded, and the
// Install action is gated behind opening that preview (a security requirement).
const expandedId: Ref<string | null> = ref(null);
// `bodies` holds ONLY successfully-fetched content; a failed preview sets
// `previewErrors` instead of poisoning `bodies`, so the error banner is never
// mistaken for reviewable content and can never be installed.
const bodies = reactive<Record<string, string>>({});
const previewErrors = reactive<Record<string, boolean>>({});
const installing = reactive<Record<string, boolean>>({});

// Preview bodies are keyed by item id, but a different source (fork/mirror) can
// reuse an id for different content — and even the same source can update an
// item in place. Whenever the catalog (re)loads (`store.items` is replaced),
// drop the cached previews so Preview re-fetches the current path and Install
// can never write a stale body under a refreshed item. `catalogGeneration` is
// bumped on each reload so an in-flight preview fetch that started before the
// reload discards its result instead of repopulating the cleared cache.
let catalogGeneration = 0;
watch(
  () => store.items,
  () => {
    catalogGeneration += 1;
    expandedId.value = null;
    for (const key of Object.keys(bodies)) delete bodies[key];
    for (const key of Object.keys(previewErrors)) delete previewErrors[key];
  },
);

onMounted(async () => {
  if (enabled.value) {
    // The one-time network/provenance warning must fire here too — and BEFORE
    // the first fetch: the settings tab can flip marketplaceNetworkEnabled
    // without going through enable(), so an already-enabled view would
    // otherwise dial GitHub before the user sees the notice. Awaited (like
    // enable()) so load() never races ahead of it; idempotent (persisted flag),
    // so enable()'s call can't double-show it.
    await maybeWarnMarketplaceNetwork(plugin);
    void store.load();
  }
});

async function enable(): Promise<void> {
  plugin.settings.marketplaceNetworkEnabled = true;
  await plugin.saveSettings();
  await maybeWarnMarketplaceNetwork(plugin);
  enabled.value = true;
  await store.load();
}

async function togglePreview(item: MarketplaceItem): Promise<void> {
  if (expandedId.value === item.id) {
    expandedId.value = null;
    return;
  }
  expandedId.value = item.id;
  if (bodies[item.id] === undefined) {
    const generation = catalogGeneration;
    try {
      previewErrors[item.id] = false;
      const body = await store.fetchBody(item);
      // If the catalog reloaded while this fetch was in flight, its body is for
      // a now-stale item id — discard it so it can't land in the cleared cache.
      if (generation !== catalogGeneration) return;
      bodies[item.id] = body;
    } catch {
      if (generation !== catalogGeneration) return;
      previewErrors[item.id] = true;
    }
  }
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
      v-if="store.loading"
      class="specorator-vue-marketplace-banner"
      role="status"
    >
      {{ t('marketplace.loading') }}
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
    <div
      v-if="availableTypes.length > 1"
      class="specorator-vue-marketplace-typefilter"
      role="group"
      :aria-label="t('marketplace.typeFilterGroupLabel')"
    >
      <button
        type="button"
        class="specorator-vue-marketplace-typechip"
        :class="{ 'is-hidden': activeTypes.size === 0 }"
        @click="clearTypes()"
      >
        {{ t('marketplace.allTypes') }}
      </button>
      <button
        v-for="type in availableTypes"
        :key="type"
        type="button"
        class="specorator-vue-marketplace-typechip"
        :class="{ 'is-on': activeTypes.has(type) }"
        :aria-pressed="activeTypes.has(type) ? 'true' : 'false'"
        @click="toggleType(type)"
      >
        {{ typeLabels[type] }}
      </button>
    </div>
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
    <div class="specorator-vue-panel-list">
      <MarketplaceCard
        v-for="row in list.rows.value"
        :key="row.id"
        :item="row"
        :installed="store.installedIds.has(row.id)"
        :installing="!!installing[row.id]"
        :expanded="expandedId === row.id"
        :body="bodies[row.id] ?? null"
        :preview-error="!!previewErrors[row.id]"
        @toggle-preview="togglePreview(row)"
        @install="install(row)"
      />
      <div
        v-if="list.rows.value.length === 0 && !store.loading"
        class="specorator-vue-empty-text"
      >
        {{ t('marketplace.empty') }}
      </div>
    </div>
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

/* Type facet chips: the toolbar's filter-chip styles are scoped to
   LibraryToolbar, so mirror the same token-based look here for a consistent
   facet row without threading a second dimension through the shared toolbar. */
.specorator-vue-marketplace-typefilter {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-space-2xs);
  margin-bottom: var(--sp-space-s);
}

.specorator-vue-marketplace-typechip {
  font-size: var(--sp-font-smaller);
  padding: var(--sp-space-3xs) var(--sp-space-xs);
  border-radius: var(--sp-radius-s);
  border: 1px solid transparent;
  cursor: pointer;
}

.specorator-vue-marketplace-typechip.is-on {
  background: var(--sp-accent);
  color: var(--sp-text-on-accent);
}

.specorator-vue-marketplace-typechip.is-hidden {
  display: none;
}
</style>
