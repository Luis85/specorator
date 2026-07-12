import { type Ref, ref, watchEffect } from 'vue';

import { MCP_ICON_MARKER } from '../../../../../../core/tools/toolIcons';
import { appendMcpIcon } from '../../../../../../shared/icons';
import { mountIcon } from '../../mountIcon';

/**
 * `IconSpan.vue`'s mount logic (icon name or the MCP marker -> `setIcon`'s
 * glyph or the MCP SVG), reproduced as a composable instead of a component:
 * every icon slot in `SubagentRenderer.ts`'s DOM contract is a `<div>`
 * (`.specorator-subagent-icon`, `.specorator-subagent-status`,
 * `.specorator-subagent-tool-icon`, `.specorator-subagent-tool-status`),
 * never the `<span>` `IconSpan.vue` renders, so it can't be reused directly
 * here without breaking the characterized tag contract.
 */
export function useIconDiv(icon: () => string | null | undefined): Ref<HTMLElement | null> {
  const el = ref<HTMLElement | null>(null);

  watchEffect(() => {
    const target = el.value;
    if (!target || target.nodeType !== 1) return;
    target.textContent = '';
    const value = icon();
    if (!value) return;
    if (value === MCP_ICON_MARKER) {
      appendMcpIcon(target);
    } else {
      mountIcon(target, value);
    }
  });

  return el;
}
