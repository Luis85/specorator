<script setup lang="ts">
import { t } from '../../../../i18n/i18n';
import type { MarketplaceItem, MarketplaceItemType } from '../../catalogTypes';

/**
 * What an item brings with it: the dependencies its `requires` resolves to, each
 * with its type and whether it is already present. Extracted from
 * `MarketplaceDetail.vue` so the detail's template keeps one concern per block.
 *
 * `error` replaces the list entirely — when the package can't be resolved (an
 * absent dependency, a cycle) there is nothing valid to enumerate, and the
 * reason is what the user needs instead.
 */
const props = defineProps<{
  dependencies: MarketplaceItem[];
  typeLabels?: Record<MarketplaceItemType, string>;
  installedIds?: ReadonlySet<string>;
  error?: string | null;
}>();

function typeLabelFor(item: MarketplaceItem): string {
  return props.typeLabels?.[item.type] ?? item.type;
}
</script>

<template>
  <div
    v-if="props.error"
    class="specorator-vue-marketplace-banner is-error"
    role="alert"
  >
    {{ props.error }}
  </div>
  <section
    v-else-if="props.dependencies.length > 0"
    class="specorator-vue-marketplace-package"
    :aria-label="t('marketplace.package.heading')"
  >
    <div class="specorator-vue-marketplace-package-head">
      {{ t('marketplace.package.heading') }}
    </div>
    <ul class="specorator-vue-marketplace-package-list">
      <li
        v-for="dependency in props.dependencies"
        :key="dependency.id"
        class="specorator-vue-marketplace-package-item"
      >
        <span class="specorator-vue-marketplace-card-badge">{{ typeLabelFor(dependency) }}</span>
        <span class="specorator-vue-marketplace-package-name">{{ dependency.name }}</span>
        <span
          v-if="props.installedIds?.has(dependency.id)"
          class="specorator-vue-marketplace-note"
        >{{ t('marketplace.installed') }}</span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.specorator-vue-marketplace-package {
  display: flex;
  flex-direction: column;
  gap: var(--sp-space-2xs);
  padding: var(--sp-space-s);
  border: 1px solid var(--sp-border);
  border-radius: var(--sp-radius-s);
  background: var(--sp-surface-raised);
}

.specorator-vue-marketplace-package-head {
  font-size: var(--sp-font-small);
  font-weight: var(--sp-weight-semibold);
  color: var(--sp-text-muted);
}

.specorator-vue-marketplace-package-list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-space-3xs);
  margin: 0;
  padding: 0;
  list-style: none;
}

.specorator-vue-marketplace-package-item {
  display: flex;
  align-items: center;
  gap: var(--sp-space-xs);
  font-size: var(--sp-font-small);
}

.specorator-vue-marketplace-package-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  user-select: text;
}

.specorator-vue-marketplace-banner.is-error {
  font-size: var(--sp-font-small);
  padding: var(--sp-space-xs) var(--sp-space-s);
  border: 1px solid var(--sp-text-error);
  border-radius: var(--sp-radius-s);
  color: var(--sp-text-error);
}

/* Shared with the detail header's note chip; scoped styles are per-component,
   so this small rule is duplicated rather than hoisted to a global sheet. */
.specorator-vue-marketplace-note {
  font-size: var(--sp-font-smaller);
  color: var(--sp-text-faint);
}
</style>
