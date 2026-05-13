<script setup lang="ts">
const emit = defineEmits<{ next: [payload: { claudeStatus: 'ready' | 'not-ready' | 'unknown' }] }>()
</script>
<template>
	<div data-testid="step3-placeholder">
		<button data-testid="step3-continue" @click="emit('next', { claudeStatus: 'unknown' })">Continue</button>
	</div>
</template>
