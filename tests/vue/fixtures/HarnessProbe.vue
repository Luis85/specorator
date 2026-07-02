<script setup lang="ts">
import { computed, ref } from 'vue';

const props = defineProps<{ label: string }>();
const count = ref(0);
const doubled = computed(() => count.value * 2);
function bump(): void {
  count.value += 1;
}
</script>

<template>
  <div class="harness-probe">
    <span>{{ props.label }}</span>
    <button type="button" @click="bump">{{ count }} / {{ doubled }}</button>
  </div>
</template>
