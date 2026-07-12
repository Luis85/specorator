<script setup lang="ts">
import { computed, inject } from 'vue';

import IconSpan from '../IconSpan.vue';
import { CALLBACKS_KEY } from '../transcriptKeys';

/**
 * Reproduces `rendering/MessageContextCard.ts`'s `renderMessageContextCard`
 * DOM contract: renders nothing (an empty root) when both `files` and
 * `folders` are empty, matching the legacy `return null` short-circuit.
 * File rows are click-clickable (and get the `--clickable` modifier class)
 * only when `openFile` is reachable via the injected callbacks, mirroring
 * the legacy `callbacks.onOpenFile` guard; folder rows are always
 * display-only (no Obsidian API to open a folder).
 */
const props = defineProps<{ files: string[]; folders: string[] }>();

const callbacks = inject(CALLBACKS_KEY, undefined);

const total = computed(() => props.files.length + props.folders.length);

function basename(path: string): string {
  return path.replace(/\\/g, '/').split('/').pop() || path;
}

function onFileClick(path: string): void {
  callbacks?.openFile(path);
}
</script>

<template>
  <!-- eslint-disable vue/singleline-html-element-content-newline -- exact textContent parity with the legacy DOM contract (no surrounding whitespace) -->
  <div
    v-if="total > 0"
    class="specorator-context-card"
  >
    <div class="specorator-context-card-header">
      <IconSpan
        icon="paperclip"
        css-class="specorator-context-card-header-icon"
      />
      <span class="specorator-context-card-header-label">{{ `Attached context (${total})` }}</span>
    </div>
    <div class="specorator-context-card-list">
      <div
        v-for="path in files"
        :key="`file:${path}`"
        class="specorator-context-card-row specorator-context-card-row--file"
        :class="{ 'specorator-context-card-row--clickable': !!callbacks }"
        @click="onFileClick(path)"
      >
        <IconSpan
          icon="file-text"
          css-class="specorator-context-card-row-icon"
        />
        <span
          class="specorator-context-card-row-name"
          :title="path"
        >{{ basename(path) }}</span>
      </div>
      <div
        v-for="path in folders"
        :key="`folder:${path}`"
        class="specorator-context-card-row specorator-context-card-row--folder"
      >
        <IconSpan
          icon="folder"
          css-class="specorator-context-card-row-icon"
        />
        <span
          class="specorator-context-card-row-name"
          :title="path"
        >{{ `${basename(path)}/` }}</span>
      </div>
    </div>
  </div>
  <!-- eslint-enable vue/singleline-html-element-content-newline -->
</template>
