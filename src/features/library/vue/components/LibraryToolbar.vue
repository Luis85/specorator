<script setup lang="ts">
import { computed } from 'vue';

import { t } from '../../../../i18n/i18n';
import type { LibrarySort } from '../../../../shared/libraryToolbar';
import { libraryToolbarLabels } from '../../../../shared/libraryToolbar';

const props = defineProps<{
  query: string;
  sort: LibrarySort;
  tags: string[];
  activeFilters: string[];
}>();

const emit = defineEmits<{
  'update:query': [value: string];
  'update:sort': [value: LibrarySort];
  'toggle-filter': [tag: string];
  'clear-filters': [];
}>();

const labels = libraryToolbarLabels();
const activeSet = computed(() => new Set(props.activeFilters));

function onSearch(e: Event): void {
  emit('update:query', (e.target as HTMLInputElement).value);
}

function onSort(e: Event): void {
  emit('update:sort', (e.target as HTMLSelectElement).value as LibrarySort);
}
</script>

<template>
  <div class="specorator-vue-toolbar">
    <input
      class="specorator-vue-toolbar-search"
      type="search"
      :placeholder="labels.searchPlaceholder"
      :aria-label="labels.searchPlaceholder"
      :value="props.query"
      @input="onSearch"
    >
    <select
      class="specorator-vue-toolbar-sort dropdown"
      :aria-label="labels.sortLabel"
      :value="props.sort"
      @change="onSort"
    >
      <option value="name">
        {{ labels.sortName }}
      </option>
      <option value="updated">
        {{ labels.sortUpdated }}
      </option>
    </select>
    <div
      v-if="props.tags.length > 0"
      class="specorator-vue-toolbar-filterchips"
      role="group"
      :aria-label="t('library.filterGroupLabel')"
    >
      <button
        type="button"
        class="specorator-vue-toolbar-filterreset"
        :class="{ 'is-hidden': props.activeFilters.length === 0 }"
        @click="emit('clear-filters')"
      >
        {{ labels.resetFilters }}
      </button>
      <button
        v-for="tag in props.tags"
        :key="tag"
        type="button"
        class="specorator-vue-toolbar-filterchip"
        :class="{ 'is-on': activeSet.has(tag) }"
        :aria-pressed="activeSet.has(tag) ? 'true' : 'false'"
        @click="emit('toggle-filter', tag)"
      >
        {{ tag }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.specorator-vue-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-space-s);
  align-items: center;
  margin-bottom: var(--sp-space-s);
}

.specorator-vue-toolbar-search {
  flex: 1 1 12rem;
  min-width: 8rem;
}

.specorator-vue-toolbar-sort {
  flex: 0 0 auto;
}

.specorator-vue-toolbar-filterchips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-space-2xs);
  flex-basis: 100%;
}

/* No background here: Obsidian's button rules (0,1,1) styled these pre-fork
   (the legacy (0,1,0) background was dead) — leaving it unset keeps the
   native button look AND hover feedback (a scoped (0,2,0) background would
   beat button:hover (0,1,1)). */
.specorator-vue-toolbar-filterchip,
.specorator-vue-toolbar-filterreset {
  font-size: var(--sp-font-smaller);
  padding: var(--sp-space-3xs) var(--sp-space-xs);
  border-radius: var(--sp-radius-s);
  border: 1px solid transparent;
  cursor: pointer;
}

.specorator-vue-toolbar-filterchip.is-on {
  background: var(--sp-accent);
  color: var(--sp-text-on-accent);
}

.specorator-vue-toolbar-filterreset.is-hidden {
  display: none;
}
</style>
