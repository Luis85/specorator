<script setup lang="ts">
import { t } from '../../../../../i18n/i18n';
import type { TeamRosterSort } from '../teamRosterSort';

/**
 * Compact search + sort for the roster rail. Deliberately NOT the Library's
 * `LibraryToolbar`: that renders a tag-filter chip row, which on a 260px rail would
 * wrap to three lines for a 10-tag roster. The underlying `useLibraryList` engine is
 * shared (so search semantics can't drift from the Library's); only the chrome differs.
 *
 * `showSearch` is owned by the parent — below a handful of agents a search field over
 * four rows is noise, so the rail hides it and renders sort alone.
 */
const props = defineProps<{
  query: string;
  sort: TeamRosterSort;
  showSearch: boolean;
}>();

const emit = defineEmits<{
  'update:query': [value: string];
  'update:sort': [value: TeamRosterSort];
}>();

function onSearch(event: Event): void {
  emit('update:query', (event.target as HTMLInputElement).value);
}

function onSort(event: Event): void {
  emit('update:sort', (event.target as HTMLSelectElement).value as TeamRosterSort);
}
</script>

<template>
  <div class="specorator-team-roster-toolbar">
    <input
      v-if="props.showSearch"
      class="specorator-team-roster-search"
      type="search"
      :placeholder="t('teamChat.rosterSearchPlaceholder')"
      :aria-label="t('teamChat.rosterSearchPlaceholder')"
      :value="props.query"
      @input="onSearch"
    >
    <!-- The `dropdown` class is required, not decorative: Obsidian only ships the
         select arrow on it (see the Vue style baseline notes). -->
    <select
      class="specorator-team-roster-sort dropdown"
      :aria-label="t('teamChat.rosterSortLabel')"
      :value="props.sort"
      @change="onSort"
    >
      <option value="recent">
        {{ t('teamChat.rosterSortRecent') }}
      </option>
      <option value="name">
        {{ t('teamChat.rosterSortName') }}
      </option>
      <option value="updated">
        {{ t('teamChat.rosterSortUpdated') }}
      </option>
    </select>
  </div>
</template>

<style scoped>
.specorator-team-roster-toolbar {
  display: flex;
  flex-direction: column;
  gap: var(--sp-space-2xs);
  padding: 0 var(--sp-space-2xs) var(--sp-space-2xs);
}
.specorator-team-roster-search,
.specorator-team-roster-sort {
  width: 100%;
  min-width: 0;
  font-size: var(--sp-font-small);
}
</style>
