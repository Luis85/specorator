<script setup lang="ts">
import { inject } from 'vue';

import { CALLBACKS_KEY } from '../../composerKeys';
import { useComposerStore } from '../../stores/composerStore';

const store = useComposerStore();
const cb = inject(CALLBACKS_KEY);
// The imperative toggle cycled activeValue↔inactiveValue from the provider
// permission config, not the literals 'active'/'inactive'. The projection carries
// both concrete values (buildPermissionState), so fire the opposite one.
function toggle(): void {
  const p = store.toolbar.permission;
  if (!p || !p.switchVisible) return;
  cb?.onSetPermission(p.active ? p.inactiveValue : p.activeValue);
}
</script>

<template>
  <div
    v-if="store.toolbar.permission && store.toolbar.permission.visible"
    class="specorator-permission-toggle"
  >
    <span
      class="specorator-permission-label"
      :class="{ 'plan-active': store.toolbar.permission.planActive }"
    >{{ store.toolbar.permission.label }}</span>
    <div
      v-show="store.toolbar.permission.switchVisible"
      class="specorator-toggle-switch"
      :class="{ active: store.toolbar.permission.active }"
      @click="toggle"
    />
  </div>
</template>
