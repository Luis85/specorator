<script setup lang="ts">
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
</style>
