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
    class="specorator-library-card"
    role="button"
    tabindex="0"
    :aria-label="props.ariaLabel"
    @click="emit('activate')"
    @keydown="onKeydown"
  >
    <div
      v-if="$slots.leading"
      class="specorator-library-card-leading"
    >
      <slot name="leading" />
    </div>
    <div class="specorator-library-card-body">
      <div class="specorator-library-card-name">
        <span>{{ props.name }}</span>
        <slot name="name-chips" />
      </div>
      <slot />
      <div
        v-if="props.tags && props.tags.length > 0"
        class="specorator-library-card-caps"
      >
        <span
          v-for="tag in props.tags"
          :key="tag"
          class="specorator-library-chip"
        >{{ tag }}</span>
      </div>
    </div>
    <div
      class="specorator-library-card-actions"
      @click.stop
    >
      <slot name="actions" />
    </div>
  </div>
</template>
