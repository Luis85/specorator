<script setup lang="ts">
import { inject, onMounted, ref } from 'vue';

import { BROWSER_INDICATOR_KEY, CANVAS_INDICATOR_KEY, SELECTION_INDICATOR_KEY } from '../../composerKeys';

// Non-reactive host for the three ENGINE-DRIVEN selection indicators. Vue renders
// the <div>s (legacy classes + initial `.specorator-hidden`) and hands the raw
// nodes to SelectionController / BrowserSelectionController / CanvasSelectionController
// via the injected register callbacks. Those controllers mutate each node's
// `textContent` + toggle `.specorator-hidden` directly by class, so this host
// never re-renders or diffs their children (a leave-me-alone host).
const sel = ref<HTMLElement | null>(null);
const browser = ref<HTMLElement | null>(null);
const canvas = ref<HTMLElement | null>(null);
const regSel = inject(SELECTION_INDICATOR_KEY, undefined);
const regBrowser = inject(BROWSER_INDICATOR_KEY, undefined);
const regCanvas = inject(CANVAS_INDICATOR_KEY, undefined);
onMounted(() => {
  if (sel.value && sel.value.nodeType === 1 && regSel) regSel(sel.value);
  if (browser.value && browser.value.nodeType === 1 && regBrowser) regBrowser(browser.value);
  if (canvas.value && canvas.value.nodeType === 1 && regCanvas) regCanvas(canvas.value);
});
</script>

<template>
  <div
    ref="sel"
    class="specorator-selection-indicator specorator-hidden"
  />
  <div
    ref="browser"
    class="specorator-browser-selection-indicator specorator-hidden"
  />
  <div
    ref="canvas"
    class="specorator-canvas-indicator specorator-hidden"
  />
</template>
