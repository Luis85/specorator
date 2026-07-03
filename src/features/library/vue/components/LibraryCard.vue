<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  name: string;
  ariaLabel: string;
  tags?: string[];
}>();

const emit = defineEmits<{ activate: [] }>();
const cardEl = ref<HTMLElement | null>(null);

function onKeydown(e: KeyboardEvent): void {
  if (e.target !== cardEl.value) return;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    emit('activate');
  }
}
</script>

<template>
  <div
    ref="cardEl"
    class="specorator-vue-card"
    role="button"
    tabindex="0"
    :aria-label="props.ariaLabel"
    @click="emit('activate')"
    @keydown="onKeydown"
  >
    <div
      v-if="$slots.leading"
      class="specorator-vue-card-leading"
    >
      <slot name="leading" />
    </div>
    <div class="specorator-vue-card-body">
      <div class="specorator-vue-card-name">
        <span>{{ props.name }}</span>
        <slot name="name-chips" />
      </div>
      <slot />
      <div
        v-if="props.tags && props.tags.length > 0"
        class="specorator-vue-card-caps"
      >
        <span
          v-for="tag in props.tags"
          :key="tag"
          class="specorator-vue-chip"
        >{{ tag }}</span>
      </div>
    </div>
    <div
      class="specorator-vue-card-actions"
      @click.stop
    >
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.specorator-vue-card {
  display: flex;
  align-items: center;
  gap: var(--sp-space-m);
  padding: var(--sp-space-m);
  border: 1px solid var(--sp-border);
  border-radius: var(--sp-radius-m);
  background: var(--sp-surface-raised);
}

/* The whole row is the open affordance. The reset's generic :focus-visible
   ring covers the keyboard affordance the legacy CSS declared per-class. */
.specorator-vue-card[role="button"] {
  cursor: pointer;
  transition: border-color 120ms ease, background 120ms ease;
}

.specorator-vue-card[role="button"]:hover {
  border-color: var(--sp-accent);
  background: var(--sp-surface-hover);
}

.specorator-vue-card-leading {
  flex: 0 0 auto;
  display: flex;
}

.specorator-vue-card-body {
  flex: 1 1 auto;
  min-width: 0;
}

.specorator-vue-card-name {
  font-weight: var(--sp-weight-semibold);
  display: flex;
  align-items: center;
  gap: var(--sp-space-s);
}

.specorator-vue-card-actions {
  flex: 0 0 auto;
  display: flex;
  gap: var(--sp-space-2xs);
}
</style>
