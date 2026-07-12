<script setup lang="ts">
import { computed } from 'vue';

/**
 * Reproduces `rendering/toolLinesExpanded.ts`'s `renderLinesExpanded`: up to
 * `maxLines` rows as `.specorator-tool-line`, stripping a leading `N→`
 * gutter, with a `.specorator-tool-truncated` footer when the result is
 * longer. Shared by the generic tool-content dispatcher and WebSearchView's
 * raw-result branches, the same reuse pattern the legacy renderer has.
 */
const props = defineProps<{ result: string; maxLines: number; hoverable?: boolean }>();

const lines = computed(() => props.result.split(/\r?\n/));
const truncated = computed(() => lines.value.length > props.maxLines);
const displayLines = computed(() => (truncated.value ? lines.value.slice(0, props.maxLines) : lines.value));
const moreLines = computed(() => lines.value.length - props.maxLines);

function stripGutter(line: string): string {
  return line.replace(/^\s*\d+→/, '') || ' ';
}
</script>

<template>
  <!-- eslint-disable vue/multiline-html-element-content-newline -- exact textContent parity with the legacy DOM contract (no surrounding whitespace) -->
  <div class="specorator-tool-lines">
    <div
      v-for="(line, i) in displayLines"
      :key="i"
      class="specorator-tool-line"
      :class="{ hoverable }"
    >{{ stripGutter(line) }}</div>
    <div
      v-if="truncated"
      class="specorator-tool-truncated"
    >... {{ moreLines }} more lines</div>
  </div>
</template>
