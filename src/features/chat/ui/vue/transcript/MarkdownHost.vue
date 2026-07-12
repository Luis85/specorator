<script setup lang="ts">
import { inject, onMounted, ref, watch } from 'vue';

import { renderMarkdownInto } from './markdownHostRender';
import { APP_KEY, COMPONENT_KEY, PLUGIN_KEY } from './transcriptKeys';

const props = defineProps<{ markdown: string; deferMath?: boolean }>();

const app = inject(APP_KEY)!;
const component = inject(COMPONENT_KEY)!;
const plugin = inject(PLUGIN_KEY)!;

const hostEl = ref<HTMLElement | null>(null);
// Monotonic token: a newer render supersedes an in-flight one. Reproduces
// streamRenderLoop's identity-token discipline for async Obsidian renders.
let generation = 0;

async function render(): Promise<void> {
  const el = hostEl.value;
  if (!el || el.nodeType !== 1) return;
  const mine = ++generation;
  const pending = el.ownerDocument.createElement('div');
  await renderMarkdownInto({
    app,
    component,
    el: pending,
    markdown: props.markdown,
    mediaFolder: plugin.settings.mediaFolder ?? '',
    deferMath: props.deferMath,
  });
  if (mine !== generation) return; // a newer render landed; drop this one
  el.empty();
  while (pending.firstChild) el.appendChild(pending.firstChild);
}

onMounted(render);
watch(() => props.markdown, render);
</script>

<template>
  <div
    ref="hostEl"
    class="specorator-markdown-host"
  />
</template>
