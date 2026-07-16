<script setup lang="ts">
import { inject } from 'vue';

import { CALLBACKS_KEY } from '../../composerKeys';
import { useComposerStore } from '../../stores/composerStore';
import { useToolbarIcon } from './useToolbarIcon';

const store = useComposerStore();
const cb = inject(CALLBACKS_KEY);
const iconEl = useToolbarIcon('zap');
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
