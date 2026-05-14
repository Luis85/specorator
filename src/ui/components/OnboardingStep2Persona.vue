<script setup lang="ts">
defineProps<{ initialValue: string }>()
const emit = defineEmits<{ next: [payload: { skipped: boolean }] }>()
</script>
<template>
	<div data-testid="step2-placeholder">
		<button data-testid="step2-continue" @click="emit('next', { skipped: false })">Continue</button>
		<button data-testid="step2-skip" @click="emit('next', { skipped: true })">Skip</button>
	</div>
</template>
