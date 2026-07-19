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
  <!-- Navigation + aria-current (matching LibraryRoot's category nav), NOT an
    ARIA tablist: a role="tab" set promises roving focus + arrow-key selection
    that this doesn't implement, so plain nav buttons are the honest, expected
    keyboard model (normal Tab order). -->
  <div
    class="specorator-vue-marketplace-nav"
    role="navigation"
    :aria-label="t('marketplace.navGroupLabel')"
  >
    <button
      type="button"
      class="specorator-vue-marketplace-navtab"
      :class="{ 'is-on': props.activeView === 'home' }"
      :aria-current="props.activeView === 'home' ? 'page' : undefined"
      @click="emit('select', 'home')"
    >
      {{ t('marketplace.nav.home') }}
    </button>
    <button
      v-for="type in presentTypes"
      :key="type"
      type="button"
      class="specorator-vue-marketplace-navtab"
      :class="{ 'is-on': props.activeView === type }"
      :aria-current="props.activeView === type ? 'page' : undefined"
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
