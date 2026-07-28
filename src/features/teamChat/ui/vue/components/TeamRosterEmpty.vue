<script setup lang="ts">
import { t } from '../../../../../i18n/i18n';

/**
 * The rail's two non-list states, in one component so `TeamRoster`'s template keeps a
 * single branch (list vs. this) instead of three interleaved `v-if`s:
 *
 *  - **No agents at all** — a first-run dead end without a way to get any, so it carries a
 *    CTA deep-linking the Marketplace's Agents category.
 *  - **No search matches** — a message rather than a silently blank rail.
 *
 * Renders nothing while the rail is collapsed: the 56px icon rail has no room for prose.
 */
const props = defineProps<{
  /** True when the roster itself is empty; false means "filtered to nothing". */
  isRosterEmpty: boolean;
  collapsed: boolean;
}>();

const emit = defineEmits<{ browse: [] }>();
</script>

<template>
  <div
    v-if="!props.collapsed"
    class="specorator-team-roster-empty"
  >
    <p class="specorator-team-roster-empty-text">
      {{ props.isRosterEmpty ? t('teamChat.rosterEmpty') : t('teamChat.rosterNoMatches') }}
    </p>
    <button
      v-if="props.isRosterEmpty"
      type="button"
      class="specorator-team-roster-empty-cta"
      @click="emit('browse')"
    >
      {{ t('teamChat.rosterEmptyCta') }}
    </button>
  </div>
</template>

<style scoped>
.specorator-team-roster-empty {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--sp-space-s);
  padding: var(--sp-space-2xs);
}
.specorator-team-roster-empty-text {
  margin: 0;
  padding: var(--sp-space-2xs);
  color: var(--sp-text-muted);
  font-size: var(--sp-font-small);
}
.specorator-team-roster-empty-cta {
  font-weight: var(--sp-weight-medium);
  font-size: var(--sp-font-small);
  color: var(--sp-text-on-accent);
  background: var(--sp-accent);
  border: 1px solid var(--sp-accent);
  border-radius: var(--sp-radius-s);
  padding: var(--sp-space-2xs) var(--sp-space-s);
  cursor: pointer;
}
.specorator-team-roster-empty-cta:hover {
  background: var(--sp-accent-hover);
  border-color: var(--sp-accent-hover);
}
.specorator-team-roster-empty-cta:focus-visible {
  outline: 2px solid var(--sp-border-focus);
  outline-offset: 2px;
}
</style>
