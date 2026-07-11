<script setup lang="ts">
import { inject, ref, watchEffect } from 'vue';

import type { ProviderId } from '../../../../../core/providers/types';
import { CALLBACKS_KEY } from '../chatShellKeys';

const props = defineProps<{ providerId: ProviderId | null; visible: boolean }>();
const cb = inject(CALLBACKS_KEY);
if (!cb) throw new Error('ChatLogo mounted without CALLBACKS_KEY');

const host = ref<HTMLElement | null>(null);
watchEffect(() => {
  const el = host.value;
  if (!el || !props.providerId) return;
  cb.renderProviderLogo(el, props.providerId);
});
</script>

<template>
  <span
    v-show="visible"
    ref="host"
    class="specorator-logo"
  />
</template>
