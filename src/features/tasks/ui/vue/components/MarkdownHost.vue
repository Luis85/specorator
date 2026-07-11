<script setup lang="ts">
import { Component, MarkdownRenderer } from 'obsidian';
import { inject, onUnmounted, ref, watchEffect } from 'vue';

import { DETAIL_APP_KEY, DETAIL_MD_COMPONENT_KEY } from '../detailKeys';

// Renders markdown into a template-ref host through Obsidian's `MarkdownRenderer`
// (the same mount-ref pattern AgentAvatar.vue uses for the imperative avatar), so
// Wikilinks / inline code / links stay interactive and NO `innerHTML`/`v-html` is
// used. `sourcePath` scopes link resolution to the work-order note.
//
// Each render gets its OWN child `Component` (parented under the modal's injected
// markdown component so it is torn down at modal close). A re-render unloads the
// prior child FIRST, so the components a previous `MarkdownRenderer.render`
// registered (embeds, callouts, etc.) are torn down instead of accumulating on
// the shared parent — this keeps the atom safe when a caller (e.g. Task 7's
// editors) binds it to live-changing markdown that re-renders on every keystroke.
const props = defineProps<{ markdown: string; sourcePath: string }>();

const app = inject(DETAIL_APP_KEY);
const parent = inject(DETAIL_MD_COMPONENT_KEY);
const host = ref<HTMLElement | null>(null);
let child: Component | null = null;

// Unload the current render's child (and detach it from the parent so it is not
// double-managed), tearing down whatever that render registered.
function teardownChild(): void {
  if (!child) return;
  if (parent) parent.removeChild(child);
  else child.unload();
  child = null;
}

watchEffect(() => {
  const el = host.value;
  if (!el || !app) return;
  // Clear before re-rendering so a markdown change replaces (never appends) the
  // prior output — mirrors the imperative renderers rebuilding into an emptied host.
  el.textContent = '';
  teardownChild();
  child = new Component();
  // addChild loads the child under the (already-loaded) parent; without a parent
  // load it directly so the render still has a live lifecycle owner.
  if (parent) parent.addChild(child);
  else child.load();
  void MarkdownRenderer.render(app, props.markdown, el, props.sourcePath, child);
});

onUnmounted(teardownChild);
</script>

<template>
  <div ref="host" />
</template>
