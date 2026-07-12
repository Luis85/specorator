<script setup lang="ts">
import { computed } from 'vue';

import ToolLinesExpanded from '../ToolLinesExpanded.vue';
import ToolLink from '../ToolLink.vue';
import { buildWebSearchSegments } from './webSearchViewModel';

/**
 * Reproduces `rendering/webSearchRenderer.ts`'s `renderWebSearchExpanded`
 * DOM contract: parsed result links take priority, then a structured
 * action-card (open_page / find_in_page / search), then raw result lines,
 * then an empty state. See `webSearchViewModel.ts` for the branch logic.
 */
const props = defineProps<{ input: Record<string, unknown>; result?: string }>();

const segments = computed(() => buildWebSearchSegments(props.input, props.result));

function truncateSummary(summary: string): string {
  return summary.length > 800 ? `${summary.slice(0, 800)}...` : summary;
}
</script>

<template>
  <!-- eslint-disable vue/multiline-html-element-content-newline -- exact textContent parity with the legacy DOM contract (no surrounding whitespace) -->
  <div
    v-if="segments[0].type === 'empty'"
    class="specorator-tool-empty"
  >{{ segments[0].text }}</div>
  <template v-else>
    <template
      v-for="(segment, si) in segments"
      :key="si"
    >
      <template v-if="segment.type === 'links'">
        <div class="specorator-tool-lines">
          <ToolLink
            v-for="(link, li) in segment.links"
            :key="li"
            :title="link.title"
            :url="link.url"
          />
        </div>
        <div
          v-if="segment.summary"
          class="specorator-tool-web-summary"
        >{{ truncateSummary(segment.summary) }}</div>
      </template>
      <div
        v-else-if="segment.type === 'actionLines'"
        class="specorator-tool-lines"
      >
        <template
          v-for="(line, li) in segment.lines"
          :key="li"
        >
          <div
            v-if="line.kind === 'text'"
            class="specorator-tool-line"
          >{{ line.text }}</div>
          <ToolLink
            v-else-if="line.kind === 'link'"
            :title="line.title"
            :url="line.url"
          />
          <div
            v-else
            class="specorator-tool-truncated"
          >{{ line.text }}</div>
        </template>
      </div>
      <ToolLinesExpanded
        v-else-if="segment.type === 'rawLines'"
        :result="segment.text"
        :max-lines="segment.maxLines"
      />
    </template>
  </template>
</template>
