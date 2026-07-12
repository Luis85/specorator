<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import { useCollapsible } from '../collapsible';
import MarkdownHost from '../MarkdownHost.vue';

/**
 * Reproduces `rendering/ThinkingBlockRenderer.ts`'s DOM contract
 * (`.specorator-thinking-block` > header + content). No `baseAriaLabel` is
 * passed to `useCollapsible` — the legacy renderer never updates the header's
 * aria-label on toggle, so it stays a static string here too.
 */
const props = defineProps<{ content: string; durationSeconds?: number; live?: boolean }>();

const { expanded, toggle, onKeydown } = useCollapsible();

const liveSeconds = ref(0);
let timerInterval: number | null = null;

onMounted(() => {
  if (!props.live) return;
  const startTime = Date.now();
  timerInterval = window.setInterval(() => {
    liveSeconds.value = Math.floor((Date.now() - startTime) / 1000);
  }, 1000);
});

onBeforeUnmount(() => {
  if (timerInterval !== null) {
    window.clearInterval(timerInterval);
    timerInterval = null;
  }
});

const label = computed(() => {
  if (props.live) return `Thinking ${liveSeconds.value}s...`;
  if (props.durationSeconds !== undefined) return `Thought for ${props.durationSeconds}s`;
  return 'Thought';
});
</script>

<template>
  <div
    class="specorator-thinking-block"
    :class="{ expanded }"
  >
    <div
      class="specorator-thinking-header"
      tabindex="0"
      role="button"
      :aria-expanded="expanded ? 'true' : 'false'"
      aria-label="Extended thinking - click to expand"
      @click="toggle"
      @keydown="onKeydown"
    >
      <span class="specorator-thinking-label">{{ label }}</span>
    </div>
    <div
      class="specorator-thinking-content"
      :class="{ 'specorator-hidden': !expanded }"
    >
      <MarkdownHost :markdown="content" />
    </div>
  </div>
</template>
