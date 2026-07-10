<script setup lang="ts">
import { MarkdownRenderer } from 'obsidian';
import { inject, ref, watchEffect } from 'vue';

import { DETAIL_APP_KEY, DETAIL_MD_COMPONENT_KEY } from '../detailKeys';

// Renders markdown into a template-ref host through Obsidian's `MarkdownRenderer`
// (the same mount-ref pattern AgentAvatar.vue uses for the imperative avatar), so
// Wikilinks / inline code / links stay interactive and NO `innerHTML`/`v-html` is
// used. The app + markdown-lifecycle component come from the modal via inject;
// `sourcePath` scopes link resolution to the work-order note.
const props = defineProps<{ markdown: string; sourcePath: string }>();

const app = inject(DETAIL_APP_KEY);
const component = inject(DETAIL_MD_COMPONENT_KEY);
const host = ref<HTMLElement | null>(null);

watchEffect(() => {
  const el = host.value;
  if (!el || !app || !component) return;
  // Clear before re-rendering so a markdown change replaces (never appends) the
  // prior output — mirrors the imperative renderers rebuilding into an emptied host.
  el.textContent = '';
  void MarkdownRenderer.render(app, props.markdown, el, props.sourcePath, component);
});
</script>

<template>
  <div ref="host" />
</template>
