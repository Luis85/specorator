<script setup lang="ts">
import { setIcon } from 'obsidian';
import { onMounted, ref } from 'vue';

const props = defineProps<{
  icon: string;
  message: string;
  actionLabel?: string;
}>();

const emit = defineEmits<{ action: [] }>();
const iconEl = ref<HTMLElement | null>(null);

onMounted(() => {
  if (iconEl.value) setIcon(iconEl.value, props.icon);
});
</script>

<template>
  <div class="specorator-library-empty">
    <div
      ref="iconEl"
      class="specorator-library-empty-icon"
    />
    <div class="specorator-library-empty-text">
      {{ props.message }}
    </div>
    <button
      v-if="props.actionLabel"
      type="button"
      class="mod-cta specorator-library-empty-action"
      @click="emit('action')"
    >
      {{ props.actionLabel }}
    </button>
  </div>
</template>
