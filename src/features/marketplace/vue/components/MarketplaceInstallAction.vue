<script setup lang="ts">
import { t } from '../../../../i18n/i18n';

/**
 * The detail header's install control. Extracted from `MarketplaceDetail.vue` to
 * keep one concern per template block.
 *
 * When the item's install needs a skill root (a skill, or a package that brings
 * skills) the header shows only an informational chip: the button lives in the
 * provider + scope panel below, which owns the chosen target.
 */
const props = defineProps<{
  /** The install is driven by the skill target panel, not this header. */
  deferredToTargetPanel: boolean;
  /** The item is present — for a package, it AND every dependency; for a skill,
   *  present in any provider root (the caller resolves which meaning applies). */
  installed: boolean;
  /** The item's type can be installed by this build at all. */
  installable: boolean;
  installing: boolean;
  /** The reviewed body has loaded — nothing installs before it has. */
  bodyLoaded: boolean;
  /** The package can't be resolved, so Install is refused. */
  blocked: boolean;
  /** Button label when installable — a package says how many items it writes. */
  installLabel: string;
}>();
const emit = defineEmits<{ install: [] }>();
</script>

<template>
  <span
    v-if="props.installed"
    :class="props.deferredToTargetPanel ? 'specorator-vue-marketplace-note' : undefined"
  >{{ t('marketplace.installed') }}</span>
  <template v-else-if="!props.deferredToTargetPanel">
    <span
      v-if="!props.installable"
      class="specorator-vue-marketplace-note"
    >{{ t('marketplace.notInstallable') }}</span>
    <button
      v-else
      type="button"
      class="mod-cta"
      :disabled="props.installing || !props.bodyLoaded || props.blocked"
      @click="emit('install')"
    >
      {{ props.installing ? t('marketplace.installing') : props.installLabel }}
    </button>
  </template>
</template>

<style scoped>
/* Shared with the detail header's note chip; scoped styles are per-component,
   so this small rule is duplicated rather than hoisted to a global sheet. */
.specorator-vue-marketplace-note {
  font-size: var(--sp-font-smaller);
  color: var(--sp-text-faint);
}
</style>
