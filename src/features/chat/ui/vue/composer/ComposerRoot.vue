<script setup lang="ts">
import { inject, onMounted, ref } from 'vue';

import ComposerNavRow from './components/ComposerNavRow.vue';
import ComposerQueueRow from './components/ComposerQueueRow.vue';
import ComposerWrapper from './components/ComposerWrapper.vue';
import { CALLBACKS_KEY, INPUT_CONTAINER_KEY } from './composerKeys';
import { useComposerEventRouting } from './useComposerEventRouting';

// Subscribe synchronously during setup so a same-turn emit is not dropped.
const callbacks = inject(CALLBACKS_KEY, undefined);
if (callbacks) {
  useComposerEventRouting(callbacks.subscribe);
}

// Vue owns `.specorator-input-container`; the engine keeps a direct handle
// (InlinePromptController's `.specorator-hidden` toggle + ChatDropController's
// overlay attach). `nodeType === 1` (not `instanceof HTMLElement`) so a popout
// window's own constructor doesn't fail the guard — see mountIcon.ts.
const containerEl = ref<HTMLElement | null>(null);
const registerContainer = inject(INPUT_CONTAINER_KEY, undefined);
onMounted(() => {
  if (containerEl.value && containerEl.value.nodeType === 1 && registerContainer) {
    registerContainer(containerEl.value);
  }
});
</script>

<template>
  <div
    ref="containerEl"
    class="specorator-input-container specorator-vue"
  >
    <ComposerQueueRow />
    <ComposerNavRow />
    <ComposerWrapper />
  </div>
</template>
