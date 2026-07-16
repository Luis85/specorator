<script setup lang="ts">
import { inject, onMounted, ref } from 'vue';

import { QUEUE_ROW_KEY } from '../composerKeys';

// Engine-driven host: QueuedMessageController.updateQueueIndicator() builds
// `.specorator-queue-indicator-*` DOM into this element and toggles its
// visibility directly. Vue never renders its children (no v-for). The register
// callback writes the raw node to BOTH tab.dom.queueIndicatorEl and
// state.queueIndicatorEl (see tabComposerMount).
const el = ref<HTMLElement | null>(null);
const register = inject(QUEUE_ROW_KEY, undefined);
onMounted(() => {
  if (el.value && el.value.nodeType === 1 && register) register(el.value);
});
</script>

<template>
  <div
    ref="el"
    class="specorator-input-queue-row"
  />
</template>
