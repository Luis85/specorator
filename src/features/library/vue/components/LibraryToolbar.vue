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
  <div class="specorator-library-toolbar">
    <input
      class="specorator-library-search"
      type="search"
      :placeholder="labels.searchPlaceholder"
      :aria-label="labels.searchPlaceholder"
      :value="props.query"
      @input="onSearch"
    >
    <select
      class="specorator-library-sort dropdown"
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
      class="specorator-library-filterchips"
      role="group"
      :aria-label="t('library.filterGroupLabel')"
    >
      <button
        type="button"
        class="specorator-library-filterreset"
        :class="{ 'is-hidden': props.activeFilters.length === 0 }"
        @click="emit('clear-filters')"
      >
        {{ labels.resetFilters }}
      </button>
      <button
        v-for="tag in props.tags"
        :key="tag"
        type="button"
        class="specorator-library-filterchip"
        :class="{ 'is-on': activeSet.has(tag) }"
        :aria-pressed="activeSet.has(tag) ? 'true' : 'false'"
        @click="emit('toggle-filter', tag)"
      >
        {{ tag }}
      </button>
    </div>
  </div>
</template>
