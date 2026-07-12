<script setup lang="ts">
import { ref, watchEffect } from 'vue';

import { MCP_ICON_MARKER } from '../../../../../core/tools/toolIcons';
import { appendMcpIcon } from '../../../../../shared/icons';
import { mountIcon } from '../mountIcon';

/**
 * Shared icon-mount atom: resolves an icon name (or the MCP marker) into
 * either `setIcon`'s glyph or the MCP SVG, matching `ToolCallRenderer.ts`'s
 * `setToolIcon` dispatch. Reused wherever a tool/status glyph needs mounting
 * (tool header icon, tool-search item icon, todo status icon, status pill,
 * web-search link icon) so the MCP-vs-lucide branch lives in one place.
 * A falsy `icon` renders an empty span (matches `resetStatusElement`'s
 * `.empty()` when no status icon applies, e.g. the "running" status).
 */
const props = defineProps<{ icon?: string | null; cssClass: string; ariaHidden?: boolean }>();

const el = ref<HTMLElement | null>(null);

watchEffect(() => {
  const target = el.value;
  if (!target || target.nodeType !== 1) return;
  target.textContent = '';
  if (!props.icon) return;
  if (props.icon === MCP_ICON_MARKER) {
    appendMcpIcon(target);
  } else {
    mountIcon(target, props.icon);
  }
});
</script>

<template>
  <span
    ref="el"
    :class="cssClass"
    :aria-hidden="ariaHidden ? 'true' : undefined"
  />
</template>
