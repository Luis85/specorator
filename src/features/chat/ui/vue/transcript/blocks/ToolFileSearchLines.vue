<script setup lang="ts">
import { computed } from 'vue';

import { useFileLink } from '../useFileLink';

/**
 * Glob/Grep/LS expanded body extracted from `ToolContentLines.vue`. Reproduces
 * `renderFileSearchExpanded`'s `decorateVaultFileLink` treatment: each
 * non-header line resolves through the shared `useFileLink` composable and
 * becomes clickable when it resolves to an openable vault path.
 */
const props = defineProps<{ result?: string }>();

const { resolve: resolveLink } = useFileLink();

function isFileSearchHeaderLine(line: string): boolean {
  const trimmed = line.trim();
  return /^Found \d+ files?:/i.test(trimmed) || /^\d+ matches across/i.test(trimmed);
}

interface FileSearchLine {
  text: string;
  hoverable: boolean;
  linkPath: string | null;
}

const fileSearchLines = computed<FileSearchLine[]>(() => {
  const lines = (props.result ?? '').split(/\r?\n/).filter(line => line.trim());
  return lines.map(line => {
    const stripped = line.replace(/^\s*\d+→/, '').trim();
    const hoverable = !isFileSearchHeaderLine(stripped);
    const linkPath = hoverable ? resolveLink(stripped) : null;
    return { text: stripped || ' ', hoverable, linkPath };
  });
});
</script>

<template>
  <!-- eslint-disable vue/multiline-html-element-content-newline, vue/singleline-html-element-content-newline -- exact textContent parity with the legacy DOM contract (no surrounding whitespace) -->
  <div
    v-if="fileSearchLines.length === 0"
    class="specorator-tool-empty"
  >No matches found</div>
  <div
    v-else
    class="specorator-tool-lines"
  >
    <div
      v-for="(line, i) in fileSearchLines"
      :key="i"
      class="specorator-tool-line"
      :class="{ hoverable: line.hoverable, 'specorator-file-link': !!line.linkPath }"
      :role="line.linkPath ? 'link' : undefined"
      :data-href="line.linkPath || null"
    >{{ line.text }}</div>
  </div>
</template>
