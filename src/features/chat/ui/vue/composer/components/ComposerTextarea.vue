<script setup lang="ts">
import { inject, onMounted, ref } from 'vue';

import { TEXTAREA_HOST_KEY } from '../composerKeys';

// Phase 1–3 host: the engine `<textarea class="specorator-input">` is appended
// into this element (registerTextareaHost). `display: contents` makes the host
// layout-transparent so the textarea participates in `.specorator-input-wrapper`
// flow exactly as when it was a direct child. Phase 4 collapses this: the SFC
// renders the <textarea> itself and registers INPUT_EL_KEY instead.
const el = ref<HTMLElement | null>(null);
const register = inject(TEXTAREA_HOST_KEY, undefined);
onMounted(() => {
  if (el.value && el.value.nodeType === 1 && register) register(el.value);
});
</script>

<template>
  <div
    ref="el"
    class="specorator-vue-composer-textarea-host"
  />
</template>

<style scoped>
.specorator-vue-composer-textarea-host {
  display: contents;
}
</style>
