<script setup lang="ts">
import { ref } from 'vue';

import { t } from '../../../../i18n/i18n';
import type { MarketplaceItem } from '../../catalogTypes';
import { iconForItem, mountLucide } from '../marketplaceIcons';

const props = defineProps<{ item: MarketplaceItem; installed: boolean; typeLabel: string }>();
const emit = defineEmits<{ open: [] }>();

const cardEl = ref<HTMLElement | null>(null);

// Releasing a text selection fires click on the card; selecting the (selectable)
// description must not open the detail. Click-path only — keyboard activation
// never carries a selection. Read the selection from the card's OWN window: in
// an Obsidian popout the module-global `window` is the main window, whose
// selection is always empty, so a popout text-selection would wrongly open.
function onClick(): void {
  const selection = cardEl.value?.ownerDocument.defaultView?.getSelection();
  if (selection?.toString()) return;
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
      <!-- Function-ref (not onMounted): the card is keyed by item.id, so a
        catalog refresh reusing an id with a changed icon/type reuses THIS
        instance — a re-running ref repaints the glyph, an onMounted hook would
        not. Mirrors the Agent Board's mountLucide usage. -->
      <div
        :ref="(el) => mountLucide(el, iconForItem(props.item))"
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
</style>
