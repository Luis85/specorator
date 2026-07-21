<script setup lang="ts">
import { computed } from 'vue';

import type { ApplyPatchFileDiff } from '../../../../../../utils/diff';
import { parseApplyPatchDiffs, parseFileUpdateChangeDiffs } from '../../../../../../utils/diff';
import ToolLinesExpanded from '../ToolLinesExpanded.vue';
import DiffView from './DiffView.vue';

/**
 * `apply_patch` expanded body: the per-file diff sections extracted from
 * `ToolContentLines.vue`. Mirrors `ToolCallRenderer.ts`'s
 * `getApplyPatchFileDiffs` — prefer the `*** Begin Patch` text format, falling
 * back to the structured `input.changes` shape (Codex `apply_patch` calls use
 * either) — then falls through to the plain 20-line result when no diff parses.
 */
const props = defineProps<{ input: Record<string, unknown>; result?: string }>();

const resolvedResult = computed(() => props.result ?? '');

const fileDiffs = computed<ApplyPatchFileDiff[]>(() => {
  const patchText = typeof props.input.patch === 'string' ? props.input.patch : '';
  const parsedDiffs = patchText ? parseApplyPatchDiffs(patchText) : [];
  return parsedDiffs.length > 0 ? parsedDiffs : parseFileUpdateChangeDiffs(props.input.changes);
});
</script>

<template>
  <!-- eslint-disable vue/multiline-html-element-content-newline, vue/singleline-html-element-content-newline -- exact textContent parity with the legacy DOM contract (no surrounding whitespace) -->
  <template v-if="fileDiffs.length > 0">
    <div
      v-for="(fileDiff, i) in fileDiffs"
      :key="i"
      class="specorator-tool-patch-section"
    >
      <div
        v-if="fileDiff.operation === 'delete' && fileDiff.diffLines.length === 0"
        class="specorator-tool-empty"
      >File deleted</div>
      <div
        v-else-if="fileDiff.diffLines.length === 0"
        class="specorator-tool-empty"
      >No textual diff available</div>
      <div
        v-else
        class="specorator-write-edit-diff-row"
      >
        <DiffView
          :diff-data="fileDiff"
          part="diff"
        />
      </div>
    </div>
  </template>
  <div
    v-else-if="!result"
    class="specorator-tool-empty"
  >No result</div>
  <ToolLinesExpanded
    v-else
    :result="resolvedResult"
    :max-lines="20"
  />
</template>
