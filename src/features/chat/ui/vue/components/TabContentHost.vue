<script setup lang="ts">
import { inject, onMounted, ref } from 'vue';

import { CONTENT_HOST_KEY } from '../chatShellKeys';

// The opaque host: Vue owns this element but NOT its children — the imperative
// tab layer createDiv's each tab's specorator-tab-content into it and toggles
// specorator-hidden on switch. No v-for, no reactive children: Vue never
// touches what lives inside, so all tab subtrees + live streaming DOM persist
// across shell re-renders. Same contract as MarkdownHost / the board lane host.
const hostEl = ref<HTMLElement | null>(null);
const mountHost = inject(CONTENT_HOST_KEY);
onMounted(() => {
  if (hostEl.value && mountHost) mountHost(hostEl.value);
});
</script>

<template>
  <div
    ref="hostEl"
    class="specorator-tab-content-container"
  />
</template>
