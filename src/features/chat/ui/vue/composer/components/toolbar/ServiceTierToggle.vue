<script setup lang="ts">
import { setIcon } from 'obsidian';
import { inject, onMounted, ref } from 'vue';

import { CALLBACKS_KEY } from '../../composerKeys';
import { useComposerStore } from '../../stores/composerStore';

const store = useComposerStore();
const cb = inject(CALLBACKS_KEY);
const iconEl = ref<HTMLElement | null>(null);
onMounted(() => { if (iconEl.value) setIcon(iconEl.value, 'zap'); });
function toggle(): void {
  const t = store.toolbar.serviceTier;
  if (!t) return;
  cb?.onSetServiceTier(t.active ? t.inactiveValue : t.activeValue);
}
</script>

<template>
  <div
    v-if="store.toolbar.serviceTier"
    class="specorator-service-tier-toggle"
  >
    <div
      class="specorator-service-tier-button"
      :class="{ active: store.toolbar.serviceTier.active }"
      title="Toggle on/off fast mode"
      @click="toggle"
    >
      <span
        ref="iconEl"
        class="specorator-service-tier-icon"
      />
    </div>
  </div>
</template>
