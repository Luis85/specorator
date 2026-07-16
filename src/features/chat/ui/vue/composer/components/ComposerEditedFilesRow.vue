<script setup lang="ts">
import { inject, onMounted, ref } from 'vue';

import { EDITED_FILES_ROW_KEY } from '../composerKeys';

// Engine host until Phase 3: EditedFilesView renders `.specorator-edited-files*`
// into this element and self-manages `.specorator-hidden`.
const el = ref<HTMLElement | null>(null);
const register = inject(EDITED_FILES_ROW_KEY, undefined);
onMounted(() => {
  if (el.value && el.value.nodeType === 1 && register) register(el.value);
});
</script>

<template>
  <div
    ref="el"
    class="specorator-edited-files-row"
  />
</template>
