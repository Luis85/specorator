<script setup lang="ts">
import { computed } from 'vue';

import { t } from '../../../../i18n/i18n';
import LibraryCard from '../../../library/vue/components/LibraryCard.vue';
import type { MarketplaceItem } from '../../catalogTypes';
import { isInstallableType } from '../../catalogTypes';
import { marketplaceTypeLabels } from '../marketplaceTypeLabels';

const props = defineProps<{
  item: MarketplaceItem;
  installed: boolean;
  installing: boolean;
  expanded: boolean;
  body: string | null;
  previewError: boolean;
}>();

const emit = defineEmits<{
  'toggle-preview': [];
  install: [];
}>();

const typeLabels = marketplaceTypeLabels();
const typeLabel = computed(() => typeLabels[props.item.type]);

// The catalog is untrusted, so `source` must not become a live href unless it
// is an http(s) URL — Vue does not sanitize `:href`, and a `javascript:` value
// would execute in the Electron renderer on click. Non-URL provenance still
// shows as inert text.
const safeSourceUrl = computed(() => {
  const src = props.item.source;
  return src && /^https?:\/\//i.test(src) ? src : null;
});
</script>

<template>
  <div class="marketplace-entry">
    <!-- eslint-disable vue/attribute-hyphenation -- vue-tsc only resolves the
      REQUIRED ariaLabel prop in camelCase (hyphenated aria-* is typed as a
      native attribute), so lint:fix must not flip it back to aria-label. -->
    <LibraryCard
      :name="props.item.name"
      :ariaLabel="props.item.name"
      :tags="props.item.tags"
      @activate="emit('toggle-preview')"
    >
      <template #leading>
        <span class="marketplace-badge">{{ typeLabel }}</span>
      </template>
      <p class="marketplace-desc">
        {{ props.item.description }}
      </p>
      <template #actions>
        <span v-if="props.installed">{{ t('marketplace.installed') }}</span>
        <span
          v-else-if="!isInstallableType(props.item.type)"
          class="marketplace-note"
        >{{ t('marketplace.notInstallable') }}</span>
        <button
          v-else
          type="button"
          @click.stop="emit('toggle-preview')"
        >
          {{ t('marketplace.preview') }}
        </button>
      </template>
    </LibraryCard>
    <!-- eslint-enable vue/attribute-hyphenation -->
    <div
      v-if="props.expanded"
      class="marketplace-preview"
    >
      <pre class="marketplace-preview-body">{{
        props.previewError ? t('marketplace.loadError') : (props.body ?? t('marketplace.loading'))
      }}</pre>
      <div
        v-if="props.item.author || props.item.license || props.item.source"
        class="marketplace-attribution"
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
      <!-- Install lives ONLY inside the preview: a user must open and see what
        they are installing first (security requirement). Stays disabled until
        the reviewed body has actually loaded (props.body !== null), so a fast
        click can't install content the preview never displayed. -->
      <button
        v-if="isInstallableType(props.item.type) && !props.installed"
        type="button"
        class="mod-cta"
        :disabled="props.installing || props.body === null"
        @click="emit('install')"
      >
        {{ props.installing ? t('marketplace.installing') : t('marketplace.install') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.marketplace-entry {
  display: flex;
  flex-direction: column;
  gap: var(--sp-space-s);
}

.marketplace-badge {
  font-size: var(--sp-font-smaller);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  white-space: nowrap;
  color: var(--sp-text-muted);
  border: 1px solid var(--sp-border);
  border-radius: var(--sp-radius-s);
  padding: var(--sp-space-3xs) var(--sp-space-xs);
}

.marketplace-desc {
  margin-top: var(--sp-space-3xs);
  font-size: var(--sp-font-small);
  color: var(--sp-text-muted);
  user-select: text;
}

.marketplace-note {
  font-size: var(--sp-font-smaller);
  color: var(--sp-text-faint);
}

.marketplace-preview {
  display: flex;
  flex-direction: column;
  gap: var(--sp-space-s);
  padding: var(--sp-space-m);
  border: 1px solid var(--sp-border);
  border-radius: var(--sp-radius-m);
  background: var(--sp-surface-raised);
}

.marketplace-preview-body {
  max-height: 20rem;
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

.marketplace-attribution {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-space-s);
  font-size: var(--sp-font-smaller);
  color: var(--sp-text-faint);
  user-select: text;
}
</style>
