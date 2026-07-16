<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue';

import { appendCheckIcon, appendMcpIcon } from '../../../../../../../shared/icons';
import { CALLBACKS_KEY } from '../../composerKeys';
import { useComposerStore } from '../../stores/composerStore';

const store = useComposerStore();
const cb = inject(CALLBACKS_KEY);

// The MCP glyph is a branded SVG (appendMcpIcon), not an Obsidian lucide icon,
// so it cannot go through useToolbarIcon/setIcon; paint it once on mount.
const iconEl = ref<HTMLElement | null>(null);
onMounted(() => {
  if (iconEl.value) appendMcpIcon(iconEl.value);
});

const count = computed(() => store.toolbar.mcp.count);
// Mirrors updateCountBadgeDisplay (ui/toolbar/shared.ts): the icon goes `.active`
// with the active title whenever count > 0 (one enabled server shows via the
// active icon, not the badge); the numeric badge appears ONLY past 1. Title
// strings copied verbatim from the imperative McpServerSelector.updateDisplay.
const iconTitle = computed(() =>
  count.value > 0
    ? `${count.value} MCP server${count.value > 1 ? 's' : ''} enabled (click to manage)`
    : 'Mcp servers (click to enable)',
);

function paintCheck(el: unknown): void {
  if (el instanceof HTMLElement) appendCheckIcon(el);
}
</script>

<template>
  <div
    v-if="store.toolbar.mcp.visible"
    class="specorator-mcp-selector"
  >
    <div class="specorator-mcp-selector-icon-wrapper">
      <span
        ref="iconEl"
        class="specorator-mcp-selector-icon"
        :class="{ active: count > 0 }"
        :title="iconTitle"
      />
      <span
        class="specorator-mcp-selector-badge"
        :class="{ visible: count > 1 }"
      >{{ count > 1 ? count : '' }}</span>
    </div>
    <!-- Always in the DOM; hover-revealed by the existing
         `.specorator-mcp-selector:hover .specorator-mcp-selector-dropdown` CSS
         (mirrors the imperative widget — no `open` flag). -->
    <div class="specorator-mcp-selector-dropdown">
      <div class="specorator-mcp-selector-header">
        Mcp servers
      </div>
      <div class="specorator-mcp-selector-list">
        <div
          v-if="store.toolbar.mcp.servers.length === 0"
          class="specorator-mcp-selector-empty"
        >
          None
        </div>
        <div
          v-for="s in store.toolbar.mcp.servers"
          :key="s.name"
          class="specorator-mcp-selector-item"
          :class="{ enabled: s.enabled }"
          @click="cb?.onToggleMcpServer(s.name)"
        >
          <span class="specorator-mcp-selector-check">
            <span
              v-if="s.enabled"
              :ref="paintCheck"
            />
          </span>
          <div class="specorator-mcp-selector-item-info">
            <span class="specorator-mcp-selector-item-name">{{ s.name }}</span>
            <span
              v-if="s.contextSaving"
              class="specorator-mcp-selector-cs-badge"
            >@</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
