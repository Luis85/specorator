<script setup lang="ts">
import { inject, onMounted, ref } from 'vue';

import { CONTEXT_ROW_KEY } from '../composerKeys';

// Engine host until Phase 3: FileChipsView (`.specorator-file-indicator`),
// ImageContextManager (`.specorator-image-preview`), and the three selection
// indicators are created into this element by initializeTabUI. Empty Vue host.
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
  />
</template>
