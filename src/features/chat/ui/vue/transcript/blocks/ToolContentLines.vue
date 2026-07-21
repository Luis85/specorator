<script setup lang="ts">
import { computed } from 'vue';

import { getToolIcon } from '../../../../../../core/tools/toolIcons';
import {
  TOOL_APPLY_PATCH,
  TOOL_BASH,
  TOOL_GLOB,
  TOOL_GREP,
  TOOL_LS,
  TOOL_READ,
  TOOL_TOOL_SEARCH,
  TOOL_WEB_FETCH,
} from '../../../../../../core/tools/toolNames';
import IconSpan from '../IconSpan.vue';
import ToolLinesExpanded from '../ToolLinesExpanded.vue';
import ToolFileSearchLines from './ToolFileSearchLines.vue';
import ToolPatchSections from './ToolPatchSections.vue';

/**
 * Generic tool-content body: ports the non-specialized branches of
 * `rendering/ToolCallRenderer.ts`'s `renderExpandedContent` — everything that
 * isn't TodoWrite, AskUserQuestion, or WebSearch (those get their own
 * dedicated components). The two heaviest branches are child components:
 * `apply_patch` per-file diff sections (`ToolPatchSections.vue`) and
 * Glob/Grep/LS file-search lines (`ToolFileSearchLines.vue`); Bash, WebFetch,
 * ToolSearch, Read, and the plain fallback stay here.
 */
const props = defineProps<{ name: string; input: Record<string, unknown>; result?: string }>();

const command = computed(() => (typeof props.input.command === 'string' ? props.input.command : ''));
// `ToolLinesExpanded` requires a non-optional `result: string`; every branch
// that reaches it is already guarded by a `result` truthiness check in the
// template, so this is only ever empty where that guard also renders the
// "No result" state instead.
const resolvedResult = computed(() => props.result ?? '');

const isApplyPatch = computed(() => props.name === TOOL_APPLY_PATCH);

const isFileSearch = computed(
  () => props.name === TOOL_GLOB || props.name === TOOL_GREP || props.name === TOOL_LS
);

const WEB_FETCH_MAX_CHARS = 500;
const webFetchText = computed(() => (props.result ?? '').slice(0, WEB_FETCH_MAX_CHARS));
const webFetchTruncated = computed(() => (props.result ?? '').length > WEB_FETCH_MAX_CHARS);
const webFetchMoreChars = computed(() => (props.result ?? '').length - WEB_FETCH_MAX_CHARS);

const toolSearchNames = computed<string[]>(() => {
  const raw = props.result;
  if (props.name !== TOOL_TOOL_SEARCH || !raw) return [];
  try {
    const parsed = JSON.parse(raw) as Array<{ type: string; tool_name: string }>;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(item => item.type === 'tool_reference' && item.tool_name)
      .map(item => item.tool_name);
  } catch {
    return [];
  }
});
</script>

<template>
  <!-- eslint-disable vue/multiline-html-element-content-newline, vue/singleline-html-element-content-newline -- exact textContent parity with the legacy DOM contract (no surrounding whitespace) -->
  <template v-if="name === TOOL_BASH">
    <div
      v-if="command"
      class="specorator-tool-bash-command"
    >$ {{ command }}</div>
    <ToolLinesExpanded
      v-if="result"
      :result="resolvedResult"
      :max-lines="20"
    />
    <div
      v-else
      class="specorator-tool-empty"
    >No result</div>
  </template>

  <ToolPatchSections
    v-else-if="isApplyPatch"
    :input="input"
    :result="result"
  />

  <div
    v-else-if="!result"
    class="specorator-tool-empty"
  >No result</div>

  <ToolFileSearchLines
    v-else-if="isFileSearch"
    :result="result"
  />

  <div
    v-else-if="name === TOOL_WEB_FETCH"
    class="specorator-tool-lines"
  >
    <div class="specorator-tool-line specorator-tool-line-wrap">{{ webFetchText }}</div>
    <div
      v-if="webFetchTruncated"
      class="specorator-tool-truncated"
    >... {{ webFetchMoreChars }} more characters</div>
  </div>

  <template v-else-if="name === TOOL_TOOL_SEARCH">
    <template v-if="toolSearchNames.length > 0">
      <div
        v-for="(toolSearchName, i) in toolSearchNames"
        :key="i"
        class="specorator-tool-search-item"
      >
        <IconSpan
          :icon="getToolIcon(toolSearchName)"
          css-class="specorator-tool-search-icon"
        />
        <span>{{ toolSearchName }}</span>
      </div>
    </template>
    <ToolLinesExpanded
      v-else
      :result="resolvedResult"
      :max-lines="20"
    />
  </template>

  <ToolLinesExpanded
    v-else-if="name === TOOL_READ"
    :result="resolvedResult"
    :max-lines="15"
  />

  <ToolLinesExpanded
    v-else
    :result="resolvedResult"
    :max-lines="20"
  />
</template>
