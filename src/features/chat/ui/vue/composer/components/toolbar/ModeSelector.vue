<script setup lang="ts">
import { inject } from 'vue';

import { CALLBACKS_KEY } from '../../composerKeys';
import { useComposerStore } from '../../stores/composerStore';

const store = useComposerStore();
const cb = inject(CALLBACKS_KEY);
function toggle(): void {
  const mode = store.toolbar.mode;
  if (!mode) return;
  const next = mode.active ? mode.options.find((o) => o.value !== mode.activeValue)?.value : mode.activeValue;
  if (next) cb?.onSetMode(next);
}
</script>

<template>
  <div
    v-if="store.toolbar.mode"
    class="specorator-mode-selector"
    :title="store.toolbar.mode.title"
    @click="toggle"
  >
    <span
      class="specorator-mode-label"
      :class="{ active: store.toolbar.mode.active }"
    >{{ store.toolbar.mode.label }}</span>
    <div
      class="specorator-toggle-switch"
      :class="{ active: store.toolbar.mode.active }"
    />
  </div>
</template>
