<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

import { LucideIconPicker } from '../../../../../shared/components/LucideIconPicker';

// Mounts the imperative `LucideIconPicker` into a template-ref host (mirrors
// AgentAvatar.vue's "mount an imperative renderer into a ref" pattern) so the
// icon field keeps the exact picker DOM/behavior the modal used. The picker
// registers a document pointer listener, so it is destroyed on unmount — the
// parity target of the imperative `onClose`'s `iconPicker.destroy()`. Initial
// value + `change` emit (the icon only changes via the picker itself, so there is
// no `watch(props.value)` re-sync), matching the imperative `onChange` seam.
const props = defineProps<{ value: string }>();
const emit = defineEmits<{ (event: 'change', value: string): void }>();

const host = ref<HTMLElement | null>(null);
let picker: LucideIconPicker | null = null;

onMounted(() => {
  if (!host.value) return;
  picker = new LucideIconPicker(host.value, {
    value: props.value,
    onChange: (iconId) => emit('change', iconId),
  });
});

onBeforeUnmount(() => {
  picker?.destroy();
  picker = null;
});
</script>

<template>
  <span ref="host" />
</template>
