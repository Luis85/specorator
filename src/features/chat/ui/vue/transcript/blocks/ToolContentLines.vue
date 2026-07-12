<script setup lang="ts">
import { computed, inject } from 'vue';

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
import type { ApplyPatchFileDiff } from '../../../../../../utils/diff';
import { parseApplyPatchDiffs, parseFileUpdateChangeDiffs } from '../../../../../../utils/diff';
import { resolveOpenableVaultPath } from '../../../../../../utils/fileLink';
import IconSpan from '../IconSpan.vue';
import ToolLinesExpanded from '../ToolLinesExpanded.vue';
import { APP_KEY, CALLBACKS_KEY } from '../transcriptKeys';
import DiffView from './DiffView.vue';

/**
 * Generic tool-content body: ports the non-specialized branches of
 * `rendering/ToolCallRenderer.ts`'s `renderExpandedContent` (plus
 * `renderBashContent` / `renderFileSearchExpanded` / `renderWebFetchExpanded`
 * / `renderToolSearchExpanded` / `renderApplyPatchDiffSections`) —
 * everything that isn't TodoWrite, AskUserQuestion, or WebSearch (those get
 * their own dedicated components).
 *
 * `apply_patch` restores the legacy `renderApplyPatchDiffSections` behavior
 * (per-file diff sections, reusing `DiffView`) when the patch/changes input
 * parses into file diffs; it deliberately does not port the rest of
 * `renderApplyPatchExpanded`'s fallback chain (`applyPatchExpandedHelpers.ts`'s
 * change-list / raw-patch-text / free-text-result-file-match rendering, or
 * the leading verification-failure line dump) — those remain a documented
 * gap, falling through to the plain 20-line default alongside the
 * agent-lifecycle JSON-object expansion.
 *
 * `Glob`/`Grep`/`LS` file-search result lines reproduce
 * `renderFileSearchExpanded`'s `decorateVaultFileLink` treatment: each
 * non-header line resolves against the injected `App` via the shared
 * `resolveOpenableVaultPath` helper and becomes clickable when it resolves.
 * (`Read`'s content here is the file's line-numbered text, not a path list —
 * it has no line-level link decoration in the legacy renderer either; only
 * its `.specorator-tool-summary` gets the link treatment, reproduced in
 * `ToolCall.vue`.)
 */
const props = defineProps<{ name: string; input: Record<string, unknown>; result?: string }>();

const app = inject(APP_KEY, undefined);
const callbacks = inject(CALLBACKS_KEY, undefined);

const command = computed(() => (typeof props.input.command === 'string' ? props.input.command : ''));
// `ToolLinesExpanded` requires a non-optional `result: string`; every branch
// that reaches it is already guarded by a `result` truthiness check in the
// template, so this is only ever empty where that guard also renders the
// "No result" state instead.
const resolvedResult = computed(() => props.result ?? '');

const isFileSearch = computed(
  () => props.name === TOOL_GLOB || props.name === TOOL_GREP || props.name === TOOL_LS
);

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
    const linkPath = hoverable && app ? resolveOpenableVaultPath(app, stripped) : null;
    return { text: stripped || ' ', hoverable, linkPath };
  });
});

function onFileSearchLineClick(linkPath: string | null): void {
  if (linkPath) {
    callbacks?.openFile(linkPath);
  }
}

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

const isApplyPatch = computed(() => props.name === TOOL_APPLY_PATCH);

// Mirrors `ToolCallRenderer.ts`'s `getApplyPatchFileDiffs`: prefer the
// `*** Begin Patch` text format, falling back to the structured
// `input.changes` shape (Codex `apply_patch` calls use either).
const applyPatchFileDiffs = computed<ApplyPatchFileDiff[]>(() => {
  if (!isApplyPatch.value) return [];
  const patchText = typeof props.input.patch === 'string' ? props.input.patch : '';
  const parsedDiffs = patchText ? parseApplyPatchDiffs(patchText) : [];
  return parsedDiffs.length > 0 ? parsedDiffs : parseFileUpdateChangeDiffs(props.input.changes);
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

  <template v-else-if="isApplyPatch">
    <template v-if="applyPatchFileDiffs.length > 0">
      <div
        v-for="(fileDiff, i) in applyPatchFileDiffs"
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

  <div
    v-else-if="!result"
    class="specorator-tool-empty"
  >No result</div>

  <template v-else-if="isFileSearch">
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
        @click="onFileSearchLineClick(line.linkPath)"
      >{{ line.text }}</div>
    </div>
  </template>

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
