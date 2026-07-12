<script setup lang="ts">
import { onBeforeUnmount, ref, watchEffect } from 'vue';

import { mountIcon } from '../mountIcon';

/**
 * Shared copy atom reproducing `rendering/messageActionButtons.ts`'s
 * `wireCopyButton` DOM contract exactly: a single element (default class
 * `.specorator-text-copy-btn`) whose own content toggles between the "copy"
 * icon and a "Copied!" label (no nested icon span), copying via
 * `navigator.clipboard` directly (matching the legacy implementation) rather
 * than a callback. `cssClass`/`ariaLabel` are optional so callers with a
 * different button class/aria-label (e.g. `MessageActionBar`'s
 * `.specorator-user-msg-copy-btn`, aria-label "Copy message") can reuse the
 * same copy/icon-toggle behavior without forking it.
 */
const props = withDefaults(
  defineProps<{ text: string; cssClass?: string; ariaLabel?: string }>(),
  { cssClass: 'specorator-text-copy-btn', ariaLabel: undefined },
);

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
    :class="[cssClass, { copied }]"
    :aria-label="ariaLabel"
    @click="onClick"
  />
</template>
