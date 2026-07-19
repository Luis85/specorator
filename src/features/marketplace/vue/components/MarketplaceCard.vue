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
// description must not open the detail. Click-path only — keyboard activation
// never carries a selection.
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
