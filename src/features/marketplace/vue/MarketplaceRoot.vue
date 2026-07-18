<script setup lang="ts">
import { Notice } from 'obsidian';
import type { Ref } from 'vue';
import { inject, onMounted, reactive, ref } from 'vue';

import { t } from '../../../i18n/i18n';
import LibraryToolbar from '../../library/vue/components/LibraryToolbar.vue';
import { useLibraryList } from '../../library/vue/useLibraryList';
import type { MarketplaceItem } from '../catalogTypes';
import { maybeWarnMarketplaceNetwork } from '../marketplaceNetworkGate';
import MarketplaceCard from './components/MarketplaceCard.vue';
import { marketplaceAccessors } from './marketplaceAccessors';
import { PLUGIN_KEY } from './marketplaceKeys';
import { useMarketplaceStore } from './stores/marketplaceStore';

const injectedPlugin = inject(PLUGIN_KEY);
if (!injectedPlugin) throw new Error('MarketplaceRoot mounted without PLUGIN_KEY');
// Re-bind after the guard so the closure-captured binding's DECLARED type is
// already narrowed to SpecoratorPlugin — vue-tsc widens a guard-narrowed
// inject() result back to `| undefined` inside nested functions like enable().
const plugin = injectedPlugin;

const store = useMarketplaceStore();
store.init(plugin);

// Source-based list: rows re-derive from the shared store, so a fetch in ANY
// Marketplace leaf updates every mounted view (multi-leaf consistency).
const list = useLibraryList<MarketplaceItem>(() => store.items, marketplaceAccessors);

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

onMounted(() => {
  if (enabled.value) void store.load();
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
    try {
      previewErrors[item.id] = false;
      bodies[item.id] = await store.fetchBody(item);
    } catch {
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
</style>
