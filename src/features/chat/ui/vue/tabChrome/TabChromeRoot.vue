<script setup lang="ts">
import { inject } from 'vue';

import NavOverlay from './NavOverlay.vue';
import StatusPanel from './StatusPanel.vue';
import { CALLBACKS_KEY } from './tabChromeKeys';
import { useTabChromeEventRouting } from './useTabChromeEventRouting';

// The tab-chrome island root: StatusPanel in place + a teleported NavOverlay.
const cb = inject(CALLBACKS_KEY);
if (!cb) throw new Error('TabChromeRoot mounted without CALLBACKS_KEY');

// Subscribe synchronously so a same-turn emit is not dropped.
useTabChromeEventRouting(cb.subscribe);
</script>

<template>
  <StatusPanel />
  <NavOverlay />
</template>
