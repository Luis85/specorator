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
  <div class="specorator-vue-empty">
    <div
      ref="iconEl"
      class="specorator-vue-empty-icon"
    />
    <div class="specorator-vue-empty-text">
      {{ props.message }}
    </div>
    <button
      v-if="props.actionLabel"
      type="button"
      class="mod-cta specorator-vue-empty-action"
      @click="emit('action')"
    >
      {{ props.actionLabel }}
    </button>
  </div>
</template>

<style scoped>
.specorator-vue-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-space-s);
  color: var(--sp-text-muted);
  text-align: center;
  padding: var(--sp-space-xl) var(--sp-space-l);
}

.specorator-vue-empty-icon {
  display: flex;
  color: var(--sp-text-faint);
}

/* setIcon() creates the <svg> imperatively — it carries no data-v attribute,
   so it MUST be reached via :deep() from its scoped host. */
.specorator-vue-empty-icon :deep(svg) {
  width: 36px;
  height: 36px;
}

.specorator-vue-empty-action {
  margin-top: var(--sp-space-2xs);
}
</style>
