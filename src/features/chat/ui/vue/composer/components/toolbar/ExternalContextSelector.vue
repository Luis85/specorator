<script setup lang="ts">
import { setIcon } from 'obsidian';
import { computed, inject } from 'vue';

import { CALLBACKS_KEY } from '../../composerKeys';
import { useComposerStore } from '../../stores/composerStore';
import { useToolbarIcon } from './useToolbarIcon';

const store = useComposerStore();
const cb = inject(CALLBACKS_KEY);
const iconEl = useToolbarIcon('folder');

const count = computed(() => store.toolbar.externalContext.count);
// Mirrors updateCountBadgeDisplay (ui/toolbar/shared.ts): the icon goes `.active`
// with the active title whenever count > 0 (one folder shows via the active
// icon, not the badge); the numeric badge appears ONLY past 1. Title strings
// copied verbatim from the imperative ExternalContextSelector.updateDisplay.
const iconTitle = computed(() =>
  count.value > 0
    ? `${count.value} external context${count.value > 1 ? 's' : ''} (click to add more)`
    : 'Add external contexts (click)',
);

function paintLock(el: unknown, persistent: boolean): void {
  if (el instanceof HTMLElement) setIcon(el, persistent ? 'lock' : 'unlock');
}
function paintRemove(el: unknown): void {
  if (el instanceof HTMLElement) setIcon(el, 'x');
}
</script>

<template>
  <div class="specorator-external-context-selector">
    <!-- The VISIBLE folder icon is the single hit target: click opens the native
         picker via onAddExternalContext (which calls openFolderPicker). -->
    <div
      class="specorator-external-context-icon-wrapper"
      @click="cb?.onAddExternalContext()"
    >
      <span
        ref="iconEl"
        class="specorator-external-context-icon"
        :class="{ active: count > 0 }"
        :title="iconTitle"
      />
      <span
        class="specorator-external-context-badge"
        :class="{ visible: count > 1 }"
      >{{ count > 1 ? count : '' }}</span>
    </div>
    <!-- ALWAYS in the DOM; revealed by the existing
         `.specorator-external-context-selector:hover .specorator-external-context-dropdown`
         CSS. No `open` flag, no second wrapper. -->
    <div class="specorator-external-context-dropdown">
      <div class="specorator-external-context-header">
        External contexts
      </div>
      <div class="specorator-external-context-list">
        <div
          v-if="store.toolbar.externalContext.items.length === 0"
          class="specorator-external-context-empty"
        >
          Click the folder icon to add
        </div>
        <div
          v-for="item in store.toolbar.externalContext.items"
          :key="item.path"
          class="specorator-external-context-item"
        >
          <span
            class="specorator-external-context-text"
            :title="item.path"
          >{{ item.path }}</span>
          <span
            :ref="(el) => paintLock(el, item.persistent)"
            class="specorator-external-context-lock"
            :class="{ locked: item.persistent }"
            :title="item.persistent ? 'Persistent (saved)' : 'Session only'"
            @click="cb?.onToggleExternalContextPersistence(item.path)"
          />
          <span
            :ref="paintRemove"
            class="specorator-external-context-remove"
            title="Remove"
            @click="cb?.onRemoveExternalContext(item.path)"
          />
        </div>
      </div>
    </div>
  </div>
</template>
