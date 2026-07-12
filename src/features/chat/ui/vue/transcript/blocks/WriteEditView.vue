<script setup lang="ts">
import { computed, inject } from 'vue';

import { getToolIcon } from '../../../../../../core/tools/toolIcons';
import type { ToolCallInfo } from '../../../../../../core/types';
import { resolveOpenableVaultPath } from '../../../../../../utils/fileLink';
import { fileNameOnly, getInputText } from '../../../../rendering/toolLabel';
import { useCollapsible } from '../collapsible';
import IconSpan from '../IconSpan.vue';
import { APP_KEY, CALLBACKS_KEY, PLUGIN_KEY } from '../transcriptKeys';
import DiffView from './DiffView.vue';

/**
 * Reproduces `rendering/WriteEditRenderer.ts`'s `renderStoredWriteEdit` DOM
 * contract for a STORED (non-streaming) Write/Edit tool call. The live
 * create/update/finalize flow (`createWriteEditBlock` /
 * `updateWriteEditWithDiff` / `finalizeWriteEditBlock`) is not reproduced —
 * only the terminal stored render this task characterizes.
 *
 * The `.specorator-write-edit-summary` link decoration reproduces
 * `decorateToolSummaryPath`'s Write/Edit branch: the raw `input.file_path`
 * (not the shortened `summaryText`) resolves against the injected `App` via
 * the shared `resolveOpenableVaultPath` helper (same resolver
 * `decorateVaultFileLink` uses).
 */
const props = defineProps<{ toolCall: ToolCallInfo }>();

const plugin = inject(PLUGIN_KEY, undefined);
const app = inject(APP_KEY, undefined);
const callbacks = inject(CALLBACKS_KEY, undefined);

/** Ported verbatim from `WriteEditRenderer.ts`'s local (unexported) `shortenPath`. */
function shortenPath(filePath: string, maxLength = 40): string {
  if (!filePath) return 'file';
  const normalized = filePath.replace(/\\/g, '/');
  if (normalized.length <= maxLength) return normalized;

  const parts = normalized.split('/');
  if (parts.length <= 2) {
    return '...' + normalized.slice(-maxLength + 3);
  }

  const filename = parts[parts.length - 1];
  const firstDir = parts[0];
  const available = maxLength - firstDir.length - filename.length - 5;

  if (available < 0) {
    return '...' + filename.slice(-maxLength + 3);
  }

  return `${firstDir}/.../${filename}`;
}

const filePath = computed(() => (props.toolCall.input.file_path as string) || 'file');
const toolName = computed(() => props.toolCall.name);
const summaryText = computed(() => fileNameOnly(filePath.value) || 'file');
const isError = computed(() => props.toolCall.status === 'error' || props.toolCall.status === 'blocked');
const isDone = computed(() => !isError.value && props.toolCall.status === 'completed');
const diffData = computed(() => props.toolCall.diffData);
const hasDiff = computed(() => !!diffData.value && diffData.value.diffLines.length > 0);

const summaryLinkPath = computed<string | null>(() => {
  if (!app) return null;
  const rawFilePath = getInputText(props.toolCall.input, 'file_path');
  return rawFilePath ? resolveOpenableVaultPath(app, rawFilePath) : null;
});

function onSummaryClick(): void {
  if (summaryLinkPath.value) {
    callbacks?.openFile(summaryLinkPath.value);
  }
}

const { expanded, toggle, onKeydown, ariaLabel } = useCollapsible({
  initiallyExpanded: plugin?.settings.expandFileEditsByDefault === true,
  baseAriaLabel: `${toolName.value}: ${shortenPath(filePath.value)}`,
});
</script>

<template>
  <!-- eslint-disable vue/multiline-html-element-content-newline, vue/singleline-html-element-content-newline -- exact textContent parity with the legacy DOM contract (no surrounding whitespace) -->
  <div
    class="specorator-write-edit-block"
    :class="{ error: isError, done: isDone, expanded }"
    :data-tool-id="toolCall.id"
  >
    <div
      class="specorator-write-edit-header"
      tabindex="0"
      role="button"
      :aria-expanded="expanded ? 'true' : 'false'"
      :aria-label="ariaLabel"
      @click="toggle"
      @keydown="onKeydown"
    >
      <IconSpan
        :icon="getToolIcon(toolName)"
        css-class="specorator-write-edit-icon"
        :aria-hidden="true"
      />
      <div class="specorator-write-edit-name">{{ toolName }}</div>
      <div
        class="specorator-write-edit-summary"
        :class="{ 'specorator-file-link': !!summaryLinkPath }"
        :role="summaryLinkPath ? 'link' : undefined"
        :data-href="summaryLinkPath || null"
        @click="onSummaryClick"
      >{{ summaryText }}</div>
      <div class="specorator-write-edit-stats">
        <DiffView
          v-if="diffData"
          :diff-data="diffData"
          part="stats"
        />
      </div>
      <IconSpan
        :icon="isError ? 'x' : null"
        css-class="specorator-write-edit-status"
        :class="{ 'status-error': isError }"
      />
    </div>
    <div
      class="specorator-write-edit-content"
      :class="{ 'specorator-hidden': !expanded }"
    >
      <div class="specorator-write-edit-diff-row">
        <DiffView
          v-if="hasDiff"
          :diff-data="diffData!"
          part="diff"
        />
        <div
          v-else-if="isError && toolCall.result"
          class="specorator-write-edit-error"
        >{{ toolCall.result }}</div>
        <div
          v-else
          class="specorator-write-edit-done-text"
        >{{ isError ? 'ERROR' : 'DONE' }}</div>
      </div>
    </div>
  </div>
</template>
