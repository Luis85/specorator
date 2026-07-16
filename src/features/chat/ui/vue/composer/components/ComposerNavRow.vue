<script setup lang="ts">
import { inject, onMounted, ref } from 'vue';

import { NAV_ROW_KEY } from '../composerKeys';

// The shell's ChatHeader teleports the tab strip into this element in 'input'
// tabBarPosition mode (resolveNavRowEl returns tab.dom.navRowEl). Empty host:
// Vue never renders children here.
const el = ref<HTMLElement | null>(null);
const register = inject(NAV_ROW_KEY, undefined);
onMounted(() => {
  if (el.value && el.value.nodeType === 1 && register) register(el.value);
});
</script>

<template>
  <div
    ref="el"
    class="specorator-input-nav-row"
  />
</template>
