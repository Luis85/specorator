<script setup lang="ts">
import { inject, onMounted, ref } from 'vue';

import { CONTEXT_ROW_KEY } from '../composerKeys';
import FileChips from './context/FileChips.vue';
import ImageChips from './context/ImageChips.vue';

// Vue now owns the reactive chip rows (`.specorator-image-preview`,
// `.specorator-file-indicator`). The three selection indicators remain
// engine-driven host elements created into this row by initializeTabUI (Task 13
// hands them back through handles). The row element itself is still registered
// so those imperative consumers keep a live handle.
const el = ref<HTMLElement | null>(null);
const register = inject(CONTEXT_ROW_KEY, undefined);
onMounted(() => {
  if (el.value && el.value.nodeType === 1 && register) register(el.value);
});
</script>

<template>
  <div
    ref="el"
    class="specorator-context-row"
  >
    <ImageChips />
    <FileChips />
    <!-- SelectionIndicators added in Task 13 -->
  </div>
</template>
