<script setup lang="ts">
import { inject, onMounted, ref } from 'vue';

import { TOOLBAR_HOST_KEY } from '../composerKeys';

// Phase 1 host: createInputToolbar builds the nine `.specorator-*-selector` /
// `.specorator-*-toggle` widgets into this element. Phase 2 replaces this with
// reactive child components (no send button — send is keyboard-only).
const el = ref<HTMLElement | null>(null);
const register = inject(TOOLBAR_HOST_KEY, undefined);
onMounted(() => {
  if (el.value && el.value.nodeType === 1 && register) register(el.value);
});
</script>

<template>
  <div
    ref="el"
    class="specorator-input-toolbar"
  />
</template>
