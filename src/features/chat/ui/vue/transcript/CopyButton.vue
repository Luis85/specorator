<script setup lang="ts">
import { onBeforeUnmount, ref, watchEffect } from 'vue';

import { mountIcon } from '../mountIcon';

/**
 * Shared copy atom reproducing `rendering/messageActionButtons.ts`'s
 * `wireCopyButton` DOM contract exactly: a single `.specorator-text-copy-btn`
 * element whose own content toggles between the "copy" icon and a "Copied!"
 * label (no nested icon span), copying via `navigator.clipboard` directly
 * (matching the legacy implementation) rather than a callback.
 */
const props = defineProps<{ text: string }>();

const copied = ref(false);
const btnEl = ref<HTMLElement | null>(null);
let feedbackTimeout: number | null = null;

watchEffect(() => {
  const el = btnEl.value;
  if (!el || el.nodeType !== 1) return;
  el.textContent = '';
  if (copied.value) {
    el.textContent = 'Copied!';
  } else {
    mountIcon(el, 'copy');
  }
});

async function onClick(e: MouseEvent): Promise<void> {
  e.stopPropagation();
  try {
    await navigator.clipboard.writeText(props.text);
  } catch {
    // Clipboard API may fail in non-secure contexts.
    return;
  }

  if (feedbackTimeout !== null) window.clearTimeout(feedbackTimeout);
  copied.value = true;
  feedbackTimeout = window.setTimeout(() => {
    copied.value = false;
    feedbackTimeout = null;
  }, 1500);
}

onBeforeUnmount(() => {
  if (feedbackTimeout !== null) window.clearTimeout(feedbackTimeout);
});
</script>

<template>
  <span
    ref="btnEl"
    class="specorator-text-copy-btn"
    :class="{ copied }"
    @click="onClick"
  />
</template>
