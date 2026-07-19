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
  <template v-if="showSkeleton">
    <!-- The skeleton is decorative (aria-hidden); a visually-hidden live status
      is the only signal a screen reader gets that the catalog is still loading. -->
    <div
      class="specorator-vue-sr-only"
      role="status"
    >
      {{ t('marketplace.loading') }}
    </div>
    <div
      class="specorator-vue-marketplace-grid"
      aria-hidden="true"
    >
      <div
        v-for="n in props.skeletonCount"
        :key="n"
        class="specorator-vue-marketplace-skeleton"
      />
    </div>
  </template>
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
  0% {
    background-position: 100% 0;
  }

  100% {
    background-position: 0 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .specorator-vue-marketplace-skeleton {
    animation: none;
  }
}
</style>
