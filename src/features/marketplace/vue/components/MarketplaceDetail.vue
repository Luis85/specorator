<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import { t } from '../../../../i18n/i18n';
import type { MarketplaceItem } from '../../catalogTypes';
import { iconForItem, mountLucide } from '../marketplaceIcons';

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

const rootEl = ref<HTMLElement | null>(null);
const nameEl = ref<HTMLElement | null>(null);

// Nearest scrollable ancestor (Obsidian's `.view-content` in practice), found by
// overflow rather than a hardcoded host class.
function scrollableAncestor(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const overflowY = getComputedStyle(node).overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') return node;
    node = node.parentElement;
  }
  return null;
}

onMounted(() => {
  // A view change: reset the scroll container to the top (opening a card from a
  // scrolled list would otherwise hide the Back button / header), and move focus
  // into the new view so keyboard + screen-reader users don't fall back to
  // <body> with no announcement.
  const scroller = scrollableAncestor(rootEl.value);
  if (scroller) scroller.scrollTop = 0;
  nameEl.value?.focus({ preventScroll: true });
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
  <div
    ref="rootEl"
    class="specorator-vue-marketplace-detail"
  >
    <button
      type="button"
      class="specorator-vue-marketplace-back"
      @click="emit('back')"
    >
      {{ t('marketplace.detail.back') }}
    </button>
    <div class="specorator-vue-marketplace-detail-head">
      <div
        :ref="(el) => mountLucide(el, iconForItem(props.item))"
        class="specorator-vue-marketplace-card-icon is-lg"
      />
      <div class="specorator-vue-marketplace-detail-titles">
        <!-- tabindex -1 + programmatic focus on mount announces the view change
          to screen readers and keeps keyboard focus inside the detail. -->
        <div
          ref="nameEl"
          tabindex="-1"
          class="specorator-vue-marketplace-detail-name"
        >
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
